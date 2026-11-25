----------------------------- MODULE PushDeadline -----------------------------
EXTENDS Naturals
CONSTANT Limit
VARIABLES sequence, view, pending, sent, expired, last
vars == <<sequence, view, pending, sent, expired, last>>

\* Source read at push.js blob fdbb6556dae59aa4938c454bf96fa4d595eec9c3.
\* Lines 94-106 (withinDeadline), 149-201 (busy, checking, notice, render,
\* request), 212-252 (sync/sequence), 253-314 (submit and final cleanup).
\* Model one page, at most Limit attempts, and arbitrary response order.
\* The browser phases may hang or reply after expiry. Expire abstracts the
\* deadline timer, which is weakly fair while the page can run. No fairness
\* is assumed for user input or external completions. Worker activation and
\* handshake are grouped with registration, and key retrieval with subscription.
\* The earlier worker-update timer is abstracted as an equivalent local exit.
\* PushStatus covers ordering of reads that have been superseded by other reads.
\* Network persistence, exact timer durations and OS settings are outside the model.

Kinds == {"read", "write"}
Phases == {"permission", "register", "subscription", "server"}
LocalPhases == Phases \ {"server"}
Permissions == {"denied", "default", "granted"}
PermissionsFor(kind) == IF kind = "read" THEN {"granted"} ELSE Permissions
Notices == {"none", "denied", "permissionNeeded", "permissionTimeout", "deviceTimeout", "lookupTimeout",
            "noSubscription", "readUnknown", "writeUnknown"}

EmptyView == [kind |-> "none", phase |-> "idle", plan |-> FALSE,
              confirmed |-> FALSE, notice |-> "none"]
Token(id, phase) == [id |-> id, phase |-> phase]
Observe(event) == [event |-> event, prior |-> view, sent |-> sent, id |-> sequence]
Waiting == view.phase # "idle"
Expected == Token(sequence, view.phase)

Init == /\ sequence = 0 /\ view = EmptyView /\ pending = {} /\ sent = {} /\ expired = {}
        /\ last = [event |-> "none", prior |-> EmptyView, sent |-> {}, id |-> 0]

Start(kind, permission) ==
    /\ sequence < Limit
    /\ ~Waiting \/ (kind = "write" /\ view.kind = "read")
    /\ sequence' = sequence + 1
    /\ LET phase == CASE permission = "denied" -> "idle"
                      [] permission = "default" -> "permission"
                      [] OTHER -> "register"
       IN /\ view' = [view EXCEPT !.kind = kind, !.phase = phase, !.confirmed = FALSE,
                         !.notice = CASE permission = "denied" -> "denied"
                                      [] kind = "read" /\ view.notice = "writeUnknown" -> "writeUnknown"
                                      [] OTHER -> "none"]
          /\ pending' = IF phase = "idle" THEN pending ELSE pending \cup {Token(sequence', phase)}
    /\ last' = Observe("start")
    /\ UNCHANGED <<sent, expired>>

Advance ==
    /\ view.phase \in LocalPhases
    /\ LET phase == CASE view.phase = "permission" -> "register"
                      [] view.phase = "register" -> "subscription"
                      [] OTHER -> "server"
       IN /\ view' = [view EXCEPT !.phase = phase]
          /\ pending' = (pending \ {Expected}) \cup {Token(sequence, phase)}
          /\ sent' = IF phase = "server" /\ view.kind = "write" THEN sent \cup {sequence} ELSE sent
    /\ last' = Observe("prepared")
    /\ UNCHANGED <<sequence, expired>>

End(nextNotice, hasPlan, confirmed) ==
    [view EXCEPT !.phase = "idle", !.notice = nextNotice, !.plan = hasPlan, !.confirmed = confirmed]

PermissionUnconfirmed(result) ==
    /\ view.phase = "permission"
    /\ view' = End(result, view.plan, FALSE)
    /\ pending' = pending \ {Expected}
    /\ last' = Observe(result)
    /\ UNCHANGED <<sequence, sent, expired>>

NoSubscription ==
    /\ view.kind = "read" /\ view.phase = "subscription"
    /\ view' = End("noSubscription", FALSE, FALSE)
    /\ pending' = pending \ {Expected}
    /\ last' = Observe("noSubscription")
    /\ UNCHANGED <<sequence, sent, expired>>

ServerFailure == IF view.kind = "write" \/ view.notice = "writeUnknown" THEN "writeUnknown" ELSE "readUnknown"
ServerReply(result) ==
    /\ view.phase = "server"
    /\ view' = IF result = "failure" THEN End(ServerFailure, view.plan, FALSE)
               ELSE End("none", result = "plan", TRUE)
    /\ pending' = pending \ {Expected}
    /\ last' = Observe(IF result = "failure" THEN "serverFailure" ELSE "serverSuccess")
    /\ UNCHANGED <<sequence, sent, expired>>

TimeoutNotice == CASE view.phase = "permission" -> "permissionTimeout"
                   [] view.phase = "server" -> ServerFailure
                   [] view.kind = "read" -> IF view.notice = "writeUnknown" THEN "writeUnknown" ELSE "lookupTimeout"
                   [] OTHER -> "deviceTimeout"
Expire ==
    /\ Waiting
    /\ view' = End(TimeoutNotice, view.plan, FALSE)
    /\ expired' = expired \cup {sequence}
    /\ last' = Observe("timeout")
    /\ UNCHANGED <<sequence, pending, sent>>

Late(callback) ==
    /\ callback \in pending /\ callback # Expected
    /\ pending' = pending \ {callback}
    /\ last' = [Observe("late") EXCEPT !.id = callback.id]
    /\ UNCHANGED <<sequence, view, sent, expired>>

Done == sequence = Limit /\ ~Waiting /\ UNCHANGED vars
Next == \/ \E kind \in Kinds : \E permission \in PermissionsFor(kind) : Start(kind, permission)
        \/ Advance \/ NoSubscription
        \/ \E result \in {"denied", "permissionNeeded"} : PermissionUnconfirmed(result)
        \/ \E result \in {"plan", "empty", "failure"} : ServerReply(result)
        \/ Expire
        \/ \E callback \in pending : Late(callback)
        \/ Done
Spec == Init /\ [][Next]_vars /\ WF_vars(Expire)

TypeOK == /\ sequence \in 0..Limit
          /\ view \in [kind : Kinds \cup {"none"}, phase : Phases \cup {"idle"},
                       plan : BOOLEAN, confirmed : BOOLEAN, notice : Notices]
          /\ pending \subseteq [id : 1..sequence, phase : Phases]
          /\ sent \subseteq 1..sequence
          /\ expired \subseteq 1..sequence
          /\ Waiting => Expected \in pending

DeadlineUnlocks == last.event = "timeout" => ~Waiting
LateCannotChange == last.event = "late" => /\ view = last.prior /\ sent = last.sent
WriteAfterPreflight == sent \ last.sent # {} =>
    /\ last.event = "prepared" /\ last.prior.phase = "subscription"
    /\ view.phase = "server" /\ view.kind = "write"
FailurePreservesPlan == last.event \in {"timeout", "serverFailure"} =>
    /\ view.plan = last.prior.plan /\ ~view.confirmed
UnconfirmedWriteNeedsLookup ==
    last.event \in {"timeout", "serverFailure"} /\ last.prior.phase = "server" /\ last.prior.kind = "write"
    => view.notice = "writeUnknown"
PermissionTimeoutDistinct == last.event = "timeout" /\ last.prior.phase = "permission" =>
    view.notice = "permissionTimeout"
UnconfirmedWriteSurvivesFailedLookup ==
    last.event \in {"timeout", "serverFailure"} /\ view.kind = "read" /\ last.prior.notice = "writeUnknown"
    => view.notice = "writeUnknown"

ActiveAttempt(id) == Waiting /\ sequence = id
AttemptReturns == \A id \in 1..Limit : ActiveAttempt(id) ~> ~ActiveAttempt(id)

PermissionTimedOut == last.event = "timeout" /\ last.prior.phase = "permission"
DeviceTimedOut == last.event = "timeout" /\ last.prior.phase = "subscription" /\ view.kind = "write"
LookupTimedOut == last.event = "timeout" /\ last.prior.phase = "subscription" /\ view.kind = "read"
WriteTimedOut == last.event = "timeout" /\ view.notice = "writeUnknown"
RetryHasLateReply == last.event = "late" /\ last.id \in expired /\ Waiting /\ sequence = 2
LookupAfterUnknownWrite == last.event = "start" /\ last.prior.notice = "writeUnknown" /\ view.kind = "read"
FailedWithKnownPlan == last.event \in {"timeout", "serverFailure"} /\ last.prior.plan
FailedLookupAfterUnknownWrite == last.event = "timeout" /\ last.prior.notice = "writeUnknown" /\ view.kind = "read"
=============================================================================
