------------------------- MODULE TransitSelection -------------------------
\* Source read at 50fb4b8 and updated against transit.js 56-245, mount/locate,
\* reset, select, load, and the query handler. See verification/transit.md for source hashes.
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
\* Browser JS runs one synchronous handler/continuation at a time. User actions
\* can supersede any pending GPS, catalog, or arrival callback. Network/GPS
\* need not return. 1 and 2 are remote-enabled stops; 3 uses only the map.
Empty == <<0,0>>
Stops == {1,2,3}
Remote(s) == s \in {1,2}
Arrival(t,g,s) == IF Remote(s) THEN {<<t,g,"arrival",s>>} ELSE {}
BootGPS == <<0,1,"location",0>>
Init == /\ serial = 0 /\ generation = 1 /\ mode = "locate" /\ selected = 0
        /\ board = Empty /\ pending = {BootGPS} /\ results = FALSE /\ hit = "mount"
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
       IN /\ generation' = token /\ pending' = pending \cup Arrival(serial',token,s)
    /\ mode' = IF Remote(s) THEN "board" ELSE "map"
    /\ selected' = s /\ board' = Empty
    /\ UNCHANGED <<results,checks,hit>>
LocationResult(r,ok) ==
    /\ r \in pending /\ r[3] = "location"
    /\ LET writes == r[2] = generation
           allowed == r[1] = serial /\ mode = "locate"
       IN /\ badLocation' = (badLocation \/ (writes # allowed))
          /\ pending' = (pending \ {r}) \cup (IF ok /\ writes THEN {<<r[1],r[2],"nearby",0>>} ELSE {})
    /\ hit' = IF mode = "query" THEN (IF ok THEN "geoAfterSearch" ELSE "geoErrorAfterSearch")
              ELSE IF mode = "board" THEN "geoAfterSelection"
              ELSE IF r = BootGPS /\ serial = 0 /\ ~ok THEN "bootDenied" ELSE "other"
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
          /\ pending' = (pending \ {r}) \cup (IF auto THEN Arrival(r[1],generation',s) ELSE {})
          /\ selected' = IF auto THEN s ELSE selected
          /\ mode' = IF auto THEN (IF Remote(s) THEN "board" ELSE "map") ELSE mode
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
              ELSE IF mode = "board" THEN "oldOtherStop"
              ELSE IF mode = "map" THEN "oldAfterMap" ELSE "other"
    /\ UNCHANGED <<serial,generation,mode,results,selected,badLocation,badCatalog>>
Next == (\E nonempty \in BOOLEAN : Search(nonempty)) \/ Locate \/ (\E s \in Stops : Select(s))
        \/ (\E r \in pending, ok \in BOOLEAN : LocationResult(r,ok))
        \/ (\E r \in pending, outcome \in {"found","none","failed"}, s \in Stops : CatalogResult(r,outcome,s))
        \/ (\E r \in pending, outcome \in {"ok","failed"}, s \in {1,2} : ArrivalResult(r,outcome,s))
        \/ UNCHANGED vars
Spec == Init /\ [][Next]_vars
LatestLocation == ~badLocation
LatestCatalog == ~badCatalog
LatestBoard == ~badBoard
SameStationBody == ~badPayload
EmptySearch == mode = "query" => selected = 0 /\ board = Empty
AutoStart == (serial = 0 /\ hit = "mount") => mode = "locate" /\ pending = {BootGPS}
MapOnly == (\A r \in pending : r[3] = "arrival" => Remote(r[4]))
           /\ (selected = 3 => mode = "map" /\ board = Empty)
AutoFoundRemote == serial = 0 /\ mode = "board"
AutoFoundMap == serial = 0 /\ mode = "map"
AutoDenied == hit = "bootDenied"
OldArrivalAfterMap == hit = "oldAfterMap"
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
