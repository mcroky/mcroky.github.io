------------------------- MODULE TransitSelection -------------------------
\* See verification/transit.md for the exact transit.js revision and mapping.
EXTENDS Naturals
CONSTANT Steps
VARIABLES serial, generation, mode, results, selected, board, pending, badLocation, badCatalog, badBoard, badPayload, hit
checks == <<badLocation,badCatalog,badBoard,badPayload>>
vars == <<serial,generation,mode,results,selected,board,pending,checks,hit>>

\* Independent user-intent serial and captured implementation generation.
\* Requests hold <<user action, captured generation, stage, requested station>>.
\* The board identifies the source request and station of displayed arrivals/errors.
\* An automatic nearest-stop selection after the async local dataset is ready
\* starts load in the same JS turn and inherits the initiating location action.
\* The two station IDs suffice to exercise both same-station reloads and changes.
Empty == <<0,0>>
Init == /\ serial = 0 /\ generation = 0 /\ mode = "idle" /\ selected = 0
        /\ board = Empty /\ pending = {} /\ results = FALSE /\ hit = "none"
        /\ badLocation = FALSE /\ badCatalog = FALSE /\ badBoard = FALSE /\ badPayload = FALSE
Search(nonempty) ==
    /\ serial < Steps /\ serial' = serial+1
    /\ generation' = generation+1
    /\ mode' = "query" /\ selected' = 0 /\ board' = Empty
    /\ results' = FALSE /\ pending' = IF nonempty THEN pending \cup {<<serial',generation',"query",0>>} ELSE pending
    /\ UNCHANGED <<checks,hit>>
Locate ==
    /\ serial < Steps /\ serial' = serial+1
    /\ LET token == generation+1
       IN /\ generation' = token /\ pending' = pending \cup {<<serial',token,"location",0>>}
    /\ mode' = "locate" /\ selected' = 0 /\ board' = Empty
    /\ results' = FALSE /\ UNCHANGED <<checks,hit>>
Select(s) ==
    /\ results /\ serial < Steps /\ serial' = serial+1
    /\ LET token == generation+1
       IN /\ generation' = token /\ pending' = pending \cup {<<serial',token,"arrival",s>>}
    /\ mode' = "board" /\ selected' = s /\ board' = Empty
    /\ UNCHANGED <<results,checks,hit>>
LocationResult(r,ok) ==
    /\ r \in pending /\ r[3] = "location"
    /\ LET writes == r[2] = generation
           allowed == r[1] = serial /\ mode = "locate"
       IN /\ badLocation' = (badLocation \/ (writes # allowed))
          /\ pending' = (pending \ {r}) \cup (IF ok /\ writes THEN {<<r[1],r[2],"nearby",0>>} ELSE {})
    /\ hit' = IF mode = "query" THEN (IF ok THEN "geoAfterSearch" ELSE "geoErrorAfterSearch")
              ELSE IF mode = "board" THEN "geoAfterSelection" ELSE "other"
    /\ UNCHANGED <<serial,generation,mode,results,selected,board,badCatalog,badBoard,badPayload>>
CatalogResult(r,outcome,s) ==
    /\ r \in pending /\ r[3] \in {"query","nearby"}
    /\ LET writes == r[2] = generation
           allowed == r[1] = serial /\ mode = (IF r[3] = "nearby" THEN "locate" ELSE "query")
           matched == writes /\ outcome = "found"
           auto == matched /\ r[3] = "nearby"
       IN /\ badCatalog' = (badCatalog \/ (writes # allowed))
          /\ results' = IF writes THEN matched ELSE results
          /\ generation' = IF auto THEN generation+1 ELSE generation
          /\ pending' = (pending \ {r}) \cup (IF auto THEN {<<r[1],generation',"arrival",s>>} ELSE {})
          /\ selected' = IF auto THEN s ELSE selected
          /\ mode' = IF auto THEN "board" ELSE mode
          /\ hit' = IF ~allowed /\ r[3] = "nearby" THEN "staleNearbyCatalog"
                    ELSE IF ~allowed THEN "staleQueryCatalog" ELSE "other"
    /\ UNCHANGED <<serial,board,badLocation,badBoard,badPayload>>
ArrivalResult(r,outcome,bodyStop) ==
    /\ r \in pending /\ r[3] = "arrival" /\ pending' = pending \ {r}
    /\ LET stationOK == selected = r[4]
           writeOK == r[2] = generation /\ stationOK
           writeError == r[2] = generation /\ stationOK
           writes == IF outcome = "ok" THEN writeOK ELSE writeError
           allowed == r[1] = serial /\ mode = "board" /\ r[4] = selected
           acceptBody == bodyStop = r[4]
       IN /\ badBoard' = (badBoard \/ (writes # allowed))
          /\ badPayload' = (badPayload \/ (writes /\ outcome = "ok" /\ acceptBody # (bodyStop = selected)))
          /\ board' = IF writes THEN <<r[1],r[4]>> ELSE board
    /\ hit' = IF r[1] = serial THEN (IF outcome = "ok" /\ bodyStop # selected THEN "rejectedForeign" ELSE "current")
              ELSE IF mode = "query" THEN "arrivalAfterSearch"
              ELSE IF mode = "board" /\ selected = r[4] THEN "oldSameStop"
              ELSE IF mode = "board" THEN "oldOtherStop" ELSE "other"
    /\ UNCHANGED <<serial,generation,mode,results,selected,badLocation,badCatalog>>
Next == (\E nonempty \in BOOLEAN : Search(nonempty)) \/ Locate \/ (\E s \in {1,2} : Select(s))
        \/ (\E r \in pending, ok \in BOOLEAN : LocationResult(r,ok))
        \/ (\E r \in pending, outcome \in {"found","none","failed"}, s \in {1,2} : CatalogResult(r,outcome,s))
        \/ (\E r \in pending, outcome \in {"ok","failed"}, s \in {1,2} : ArrivalResult(r,outcome,s))
        \/ UNCHANGED vars
Spec == Init /\ [][Next]_vars
LatestLocation == ~badLocation
LatestCatalog == ~badCatalog
LatestBoard == ~badBoard
SameStationBody == ~badPayload
EmptySearch == mode = "query" => selected = 0 /\ board = Empty
GeoAfterSearch == hit = "geoAfterSearch"
GeoErrorAfterSearch == hit = "geoErrorAfterSearch"
GeoAfterSelection == hit = "geoAfterSelection"
OldSameStop == hit = "oldSameStop"
OldOtherStop == hit = "oldOtherStop"
ArrivalAfterSearch == hit = "arrivalAfterSearch"
StaleNearbyCatalog == hit = "staleNearbyCatalog"
StaleQueryCatalog == hit = "staleQueryCatalog"
RejectedForeignBody == hit = "rejectedForeign"
============================================================================
