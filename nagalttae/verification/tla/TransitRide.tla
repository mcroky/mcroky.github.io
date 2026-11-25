---------------------------- MODULE TransitRide ----------------------------
EXTENDS Naturals, Sequences
CONSTANT Trips
VARIABLES phase, rows, key, wanted, index, expected, hit
vars == <<phase,rows,key,wanted,index,expected,hit>>

\* Production uses undefined for a fresh station, null for a row without a
\* stable trip identifier, and a string for a known vehicle journey.
Unset == Trips+1
Anonymous == 0
Ids == 1..Trips
Values == Ids \cup {Anonymous}
Batches == {<<>>} \cup {<<a>> : a \in Values}
           \cup {<<a,b>> : a \in Values, b \in Values}

\* Index zero means no visible selection. An index of 1 is the first row.
Find(k,b) ==
    IF k = Unset THEN IF Len(b)>0 THEN 1 ELSE 0
    ELSE IF k = Anonymous THEN 0
    ELSE LET matches == {i \in 1..Len(b) : b[i] = k}
         IN IF matches = {} THEN 0
            ELSE CHOOSE i \in matches : \A j \in matches : i <= j

\* Independent finite oracle: a fresh station chooses its first available
\* row. A remembered trip can occupy either position, and an unidentified
\* trip cannot be recognized on a later refresh.
WantedIndex(k,b) ==
    IF Len(b) = 0 THEN 0
    ELSE IF k = Unset THEN 1
    ELSE IF k \notin Ids THEN 0
    ELSE IF b[1] = k THEN 1
    ELSE IF Len(b) = 2 THEN IF b[2] = k THEN 2 ELSE 0
    ELSE 0

Init == /\ phase = "waiting" /\ rows = <<>> /\ key = Unset /\ wanted = Unset
        /\ index = 0 /\ expected = 0 /\ hit = "none"

Fresh == /\ phase' = "waiting" /\ rows' = <<>> /\ index' = 0 /\ expected' = 0
         /\ key' = Unset /\ wanted' = Unset /\ hit' = "fresh"
Refresh == /\ phase' = "waiting" /\ rows' = <<>> /\ index' = 0 /\ expected' = 0
           /\ key' = key /\ wanted' = wanted
           /\ hit' = IF phase = "waiting" /\ wanted \in Ids THEN "overlap" ELSE "refresh"
Failed == /\ phase = "waiting" /\ phase' = "error" /\ hit' = "failed"
          /\ UNCHANGED <<rows,key,wanted,index,expected>>
Settle(b) ==
    /\ phase = "waiting" /\ phase' = "available" /\ rows' = b
    /\ index' = Find(key,b) /\ expected' = WantedIndex(wanted,b)
    /\ key' = IF index' > 0 THEN b[index'] ELSE key
    /\ wanted' = IF wanted = Unset /\ Len(b) > 0 THEN b[1] ELSE wanted
    /\ hit' = IF wanted = Anonymous /\ Len(b)>0 THEN "unknownTrip"
              ELSE IF wanted \in Ids /\ expected' = 0 /\ Len(b)>0 THEN "lost"
              ELSE IF wanted \in Ids /\ expected' = 2 THEN "second" ELSE "settled"
Pick(i) ==
    /\ phase = "available"
    /\ i \in (IF index = 0 /\ Len(rows) > 0 THEN 0..Len(rows) ELSE 1..Len(rows))
    /\ index' = i /\ expected' = i
    /\ key' = IF i>0 THEN rows[i] ELSE Anonymous
    /\ wanted' = IF i>0 THEN rows[i] ELSE Anonymous
    /\ hit' = "pick" /\ UNCHANGED <<phase,rows>>
Next == Fresh \/ Refresh \/ Failed \/ (\E b \in Batches : Settle(b))
        \/ (\E i \in 0..2 : Pick(i))
Spec == Init /\ [][Next]_vars
ChoicePreserved == key = wanted
SelectionCorrect == index = expected
HiddenWhileWaiting == phase # "available" => rows = <<>> /\ index = 0
OverlapKnown == hit = "overlap"
MissingKnown == hit = "lost"
SecondPosition == hit = "second"
MissingIdentity == hit = "unknownTrip"
============================================================================
