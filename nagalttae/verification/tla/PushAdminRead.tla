--------------------------- MODULE PushAdminRead ---------------------------
EXTENDS Naturals
CONSTANT Count, Configured
VARIABLES requests
vars == <<requests>>

\* Source read at push-server/admin/viewer.mjs blob cddddd29b25be5826bd661acbb16f379da03c063,
\* lines 17-73. Models routes, code/cookie checks, read-only audit queries and output.
\* "match" is a credential whose digest equals the configured server digest.
\* "claim" is a caller-controlled non-cookie value on GET. Blank settings and
\* credential-check failures provide no authority. Each GET independently
\* verifies its submitted cookie. A valid cookie may have been issued before
\* this bounded execution. validInput abstracts POST form transport checks
\* or GET date/page validation. "failed" includes platform handling of an
\* exception during checking. The model assumes correct cryptographic comparison,
\* omits cookie transport details and backend filtering, and uses symbolic
\* row ownership to check that no request borrows another request's results.

RequestIds == 1..Count
Routes == {"getRoot", "postRoot", "wrongPath", "wrongMethod"}
Credentials == {"match", "other", "missing", "error"}
Results == {"rows", "empty", "failed"}

InitialRequest == [route |-> "getRoot", credential |-> "missing", claim |-> FALSE,
                   validInput |-> TRUE, phase |-> "idle", queried |-> FALSE,
                   result |-> "none", origin |-> 0, response |-> "none"]
Init == requests = [r \in RequestIds |-> InitialRequest]

Inputs(route) ==
    CASE route = "getRoot" -> [credential : Credentials, claim : BOOLEAN, validInput : BOOLEAN]
      [] route = "postRoot" -> [credential : Credentials, claim : {FALSE}, validInput : BOOLEAN]
      [] OTHER -> [credential : {"match"}, claim : {FALSE}, validInput : {TRUE}]

Receive(r, route, input) ==
    /\ requests[r].phase = "idle"
    /\ requests' = [requests EXCEPT ![r].route = route, ![r].credential = input.credential,
         ![r].claim = input.claim, ![r].validInput = input.validInput,
         ![r].phase = CASE route = "getRoot" -> "cookieCheck"
                        [] route = "postRoot" -> "codeCheck"
                        [] OTHER -> "done",
         ![r].response = IF route \in {"getRoot", "postRoot"} THEN "none" ELSE "blocked"]

SubmitCode(r) ==
    /\ requests[r].phase = "codeCheck"
    /\ LET approvedCode == Configured /\ requests[r].credential = "match"
       IN requests' = [requests EXCEPT ![r].phase = "done",
                         ![r].response = CASE ~requests[r].validInput -> "blocked"
                                          [] Configured /\ requests[r].credential = "error" -> "failed"
                                          [] approvedCode -> "cookie"
                                          [] OTHER -> "denied"]

CheckCookie(r) ==
    /\ requests[r].phase = "cookieCheck"
    /\ LET approvedCookie == Configured /\ requests[r].credential = "match"
       IN requests' = [requests EXCEPT ![r].phase = IF approvedCookie THEN "approved" ELSE "done",
                         ![r].response = CASE approvedCookie -> "none"
                                          [] Configured /\ requests[r].credential = "error" -> "failed"
                                          [] OTHER -> "form"]

BeginQuery(r) ==
    /\ requests[r].phase = "approved"
    /\ LET mayQuery == requests[r].validInput
       IN requests' = [requests EXCEPT ![r].phase = IF mayQuery THEN "query" ELSE "done",
                         ![r].queried = mayQuery,
                         ![r].response = IF mayQuery THEN "none" ELSE "blocked"]

FinishQuery(r, result) ==
    /\ requests[r].phase = "query"
    /\ requests' = [requests EXCEPT ![r].result = result,
         ![r].origin = IF result = "rows" THEN r ELSE 0,
         ![r].phase = "render"]

Render(r) ==
    /\ requests[r].phase = "render"
    /\ requests' = [requests EXCEPT ![r].phase = "done",
                     ![r].response = requests[r].result]

Done == /\ \A r \in RequestIds : requests[r].phase = "done"
        /\ UNCHANGED vars
Next == \/ \E r \in RequestIds, route \in Routes :
              \E input \in Inputs(route) : Receive(r, route, input)
        \/ \E r \in RequestIds : SubmitCode(r) \/ CheckCookie(r) \/ BeginQuery(r) \/ Render(r)
        \/ \E r \in RequestIds, result \in Results : FinishQuery(r, result)
        \/ Done
Spec == Init /\ [][Next]_vars

Responses == Results \cup {"blocked", "cookie", "denied", "form", "none"}
TypeOK == /\ requests \in [RequestIds ->
             [route : Routes, claim : BOOLEAN, credential : Credentials, validInput : BOOLEAN,
              phase : {"idle","cookieCheck","codeCheck","approved","query","render","done"},
              queried : BOOLEAN, result : Results \cup {"none"}, origin : 0..Count,
              response : Responses]]
          /\ \A r \in RequestIds : requests[r].phase = "done" => requests[r].response # "none"

CookieRequiresMatchingPost ==
    \A r \in RequestIds : requests[r].response = "cookie" =>
        /\ requests[r].route = "postRoot" /\ Configured /\ requests[r].credential = "match"
        /\ requests[r].validInput

QueryRequiresRootGet ==
    \A r \in RequestIds : requests[r].queried => requests[r].route = "getRoot"

QueryRequiresMatchingCookie ==
    \A r \in RequestIds : requests[r].queried => Configured /\ requests[r].credential = "match"

QueryRequiresValidInput ==
    \A r \in RequestIds : requests[r].queried => requests[r].validInput

RowsStayWithRequest ==
    \A r \in RequestIds : requests[r].response = "rows" =>
        /\ requests[r].origin = r /\ requests[r].queried
        /\ Configured /\ requests[r].credential = "match" /\ requests[r].route = "getRoot"

OwnerRendered ==
    \E r \in RequestIds : requests[r].response = "rows" /\ requests[r].origin = r
EmptyQuery ==
    \E r \in RequestIds : requests[r].response = "empty"
FailedQuery ==
    \E r \in RequestIds : requests[r].queried /\ requests[r].response = "failed"
CodeAccepted ==
    \E r \in RequestIds : requests[r].response = "cookie"
WrongCodeDenied ==
    \E r \in RequestIds : requests[r].credential = "other" /\ requests[r].response = "denied"
FailedCodeCheckDenied ==
    \E r \in RequestIds : requests[r].route = "postRoot" /\ requests[r].credential = "error" /\
                        requests[r].response = "failed"
FailedCookieCheckDenied ==
    \E r \in RequestIds : requests[r].route = "getRoot" /\ requests[r].credential = "error" /\
                        requests[r].response = "failed"
BadFormBlocked ==
    \E r \in RequestIds : requests[r].route = "postRoot" /\ requests[r].credential = "match" /\
                        ~requests[r].validInput /\ requests[r].response = "blocked"
MissingCookieShowsForm ==
    \E r \in RequestIds : requests[r].credential = "missing" /\ requests[r].response = "form"
ClaimWithoutCookieShowsForm ==
    \E r \in RequestIds : requests[r].claim /\ requests[r].credential # "match" /\ requests[r].response = "form"
BadInputBlocked ==
    \E r \in RequestIds : requests[r].route = "getRoot" /\ requests[r].credential = "match" /\
                        ~requests[r].validInput /\ requests[r].response = "blocked"
WrongPathBlocked ==
    \E r \in RequestIds : requests[r].route = "wrongPath" /\ requests[r].response = "blocked"
WrongMethodBlocked ==
    \E r \in RequestIds : requests[r].route = "wrongMethod" /\ requests[r].response = "blocked"
MissingDigestBlocksCode ==
    \E r \in RequestIds : requests[r].credential = "match" /\ requests[r].response = "denied"
MissingDigestBlocksCookie ==
    \E r \in RequestIds : requests[r].credential = "match" /\ requests[r].response = "form"
OverlappingRequests ==
    \E owner, visitor \in RequestIds : owner # visitor /\
        requests[owner].phase = "query" /\ requests[visitor].response = "form"
====
