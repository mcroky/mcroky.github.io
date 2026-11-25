---------------------------- MODULE PushDelivery ----------------------------
EXTENDS Naturals
VARIABLES now, pair, q, pc, item, result, applied, risk, hit, badExpire, badRetry, badOther, badGone
checks == <<badExpire,badRetry,badOther,badGone>>
vars == <<now,pair,q,pc,item,result,applied,risk,hit,checks>>

\* Source read at schedule.js blob f0b8606665ad6dec03f32b7dc6ee8bb3bae7a9c7
\* lines 25-53 and worker.js blob f1600f847444d351071a09443d18c637dc1e1201
\* lines 26-41 and 72-116, ReminderDevice.alarm/save. Selecting the event and obtaining
\* VAPID keys precede the second clock check before building the push.
\* One active outing, after successful creation, until retirement. now=1 at scheduling.
\* Zero means absent. Model minutes are discrete representative slots: retry=1,
\* grace=3; real values are 15s, 300s. Tick can interleave with the network and
\* save. A lost callback before durable save discards that callback, not the queue.
\* No fairness assumption on browser/network/clock. External receipt is not observable.
Kinds == {"ready","leave","both"}
Outcomes == {"ok","temp","permanent","gone"}
None == [k \in Kinds |-> 0]
Grace == 3
At(k) == IF k = "ready" THEN pair[1] ELSE pair[2]
Same == pair[1] = pair[2]
Eligible(k) == At(k) > 1 /\ IF Same THEN k = "both" ELSE k # "both"
Queue == {k \in Kinds : q[k] # 0}
Due(k) == k \in Queue /\ q[k] <= now /\ \A other \in Queue : q[k] <= q[other]
Init == /\ now = 1 /\ pair \in {<<2,4>>,<<2,3>>,<<3,3>>,<<1,4>>}
        /\ q = [k \in Kinds |-> IF Eligible(k) THEN At(k) ELSE 0]
        /\ pc = "idle" /\ item = "none" /\ result = "none" /\ applied = {} /\ risk = {}
        /\ hit = "none" /\ badExpire = FALSE /\ badRetry = FALSE /\ badOther = FALSE /\ badGone = FALSE
Wake == /\ pc = "idle" /\ Queue # {} /\ pc' = "loop"
        /\ UNCHANGED <<now,pair,q,item,result,applied,risk,hit,checks>>
Dispatch(k,response) ==
    /\ pc = "prepare" /\ item = k
    /\ LET network == now < At(k)+Grace
       IN /\ result' = IF network THEN response ELSE "expired"
          /\ badExpire' = (badExpire \/ (network /\ now >= At(k)+Grace))
          /\ hit' = IF network /\ response = "ok" /\ k \in risk THEN "duplicate"
                    ELSE IF ~network THEN "expiredWhilePreparing" ELSE hit
    /\ pc' = "answer" /\ item' = k
    /\ UNCHANGED <<now,pair,q,applied,risk,badRetry,badOther,badGone>>
Select(k) ==
    /\ pc = "loop" /\ Due(k) /\ item' = k
    /\ LET expired == now >= At(k)+Grace
       IN /\ pc' = IF expired THEN "answer" ELSE "prepare"
          /\ result' = IF expired THEN "expired" ELSE "none"
          /\ hit' = IF expired THEN "expired" ELSE hit
    /\ UNCHANGED <<now,pair,q,applied,risk,checks>>
Commit ==
    /\ pc = "answer"
    /\ LET retry == result = "temp" /\ now+1 < At(item)+Grace
           next == IF result = "gone" THEN None
                   ELSE [q EXCEPT ![item] = IF retry THEN now+1 ELSE 0]
           expectedRetry == result = "temp" /\ now+1 < At(item)+Grace
       IN /\ q' = next
          /\ badRetry' = (badRetry \/ (next[item] # (IF expectedRetry THEN now+1 ELSE 0)))
          /\ badOther' = (badOther \/ (result # "gone" /\ (\E k \in Kinds \ {item} : next[k] # q[k])))
          /\ badGone' = (badGone \/ (result = "gone" /\ next # None))
          /\ applied' = IF result \in {"ok","expired","permanent"} THEN applied \cup {item} ELSE applied
          /\ hit' = IF retry /\ item = "ready" /\ next["leave"] > 0 THEN "bothPending"
                    ELSE IF result = "temp" /\ ~retry THEN "retryExpired" ELSE hit
    /\ risk' = risk \ {item} /\ pc' = "loop" /\ item' = "none" /\ result' = "none"
    /\ UNCHANGED <<now,pair,badExpire>>
Crash ==
    /\ pc = "answer" /\ pc' = "idle"
    /\ risk' = IF result = "ok" THEN risk \cup {item} ELSE risk
    /\ item' = "none" /\ result' = "none"
    /\ UNCHANGED <<now,pair,q,applied,hit,checks>>
Release == /\ pc = "loop" /\ ~(\E k \in Kinds : Due(k)) /\ pc' = "idle"
           /\ UNCHANGED <<now,pair,q,item,result,applied,risk,hit,checks>>
Tick == /\ now < 8 /\ now' = now+1 /\ UNCHANGED <<pair,q,pc,item,result,applied,risk,hit,checks>>
Next == Wake \/ (\E k \in Kinds : Select(k)) \/ (\E k \in Kinds, r \in Outcomes : Dispatch(k,r)) \/ Commit \/ Crash \/ Release \/ Tick
        \/ UNCHANGED vars
Spec == Init /\ [][Next]_vars
ExpiryGate == ~badExpire
RetryOnlyBeforeDeadline == ~badRetry
PreserveOtherReminder == ~badOther
GoneClosesDevice == ~badGone
NoRequeueAfterCommit == applied \cap Queue = {}
DuplicateAfterCrash == hit = "duplicate"
ReadyRetryKeepsLeave == hit = "bothPending"
ExactRetryCutoff == hit = "retryExpired"
ExpiredSkip == hit = "expired"
ExpiredDuringKeyLookup == hit = "expiredWhilePreparing"
Coalesced == Same /\ Queue = {"both"}
PastReadySkipped == pair[1] = 1 /\ Queue = {"leave"}
============================================================================
