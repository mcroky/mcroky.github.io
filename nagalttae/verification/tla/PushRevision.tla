-------------------------- MODULE PushRevision --------------------------
EXTENDS Naturals
CONSTANT Limit
VARIABLES now, issued, db, pc, proposed, badRev, badReplay, badSame, badAck, badLock, badPurge, hit
flags == <<badRev,badReplay,badSame,badAck,badLock,badPurge,hit>>
vars == <<now,issued,db,pc,proposed,flags>>

\* Source read at schedule.js blob f0b8606665ad6dec03f32b7dc6ee8bb3bae7a9c7
\* lines 25-44 and worker.js blob f1600f847444d351071a09443d18c637dc1e1201
\* lines 26-70. One Durable Object per subscription capability, one stored plan.
\* schedule.js change; worker.js ReminderDevice.update/save/alarm. Shape=0 means cancel.
\* Positive shapes are distinct normalized (ready,leave,locale) identities whose
\* leave times are the shape numbers. Only future values within Horizon are admitted.
\* Nonce integers are distinct through Limit; abstract committed ready delivery as
\* done. oldShape is a property witness only; closed storage has no schedule data.
\* An active plan can close on its last event or on 404/410. PushDelivery models sends.
Horizon == 3
End == 7
Empty == [shape |-> 0, rev |-> 0, done |-> FALSE, oldShape |-> 0, closedAt |-> 0, until |-> 0]
Closed(nonce) == [shape |-> 0, rev |-> nonce, done |-> FALSE, oldShape |-> db.shape, closedAt |-> now, until |-> now+Horizon]
New(s,nonce) == [shape |-> s, rev |-> nonce, done |-> FALSE, oldShape |-> 0, closedAt |-> 0, until |-> 0]
Init == /\ now = 0 /\ issued = 0 /\ db = Empty /\ pc = "idle" /\ proposed = Empty
        /\ badRev = FALSE /\ badReplay = FALSE /\ badSame = FALSE /\ badAck = FALSE /\ badLock = FALSE
        /\ badPurge = FALSE /\ hit = "none"
Begin(s,expected) ==
    /\ pc = "idle"
    /\ LET valid == s = 0 \/ (s > now /\ s <= now+Horizon)
           same == s # 0 /\ s = db.shape
           oldNull == valid /\ s # 0 /\ db.shape = 0 /\ db.oldShape = s /\ expected = 0
           knownRevision == db.rev
           status == IF ~valid THEN 422 ELSE IF same THEN 200 ELSE IF expected # knownRevision THEN 409 ELSE 200
           replace == status = 200 /\ ~same /\ (s # 0 \/ db.shape # 0)
           next == IF ~replace THEN db ELSE IF s = 0 THEN Closed(issued+1) ELSE New(s,issued+1)
       IN /\ ~replace \/ issued < Limit
          /\ proposed' = next /\ pc' = "update"
          /\ badRev' = (badRev \/ (valid /\ ~same /\ expected # db.rev /\ (status # 409 \/ next # db))
                            \/ (~valid /\ (status # 422 \/ next # db))
                            \/ (valid /\ ~same /\ expected = db.rev /\ status # 200))
          /\ badSame' = (badSame \/ (valid /\ same /\ (status # 200 \/ next # db)))
          /\ badReplay' = (badReplay \/ (oldNull /\ status = 200 /\ next.shape = s))
          /\ hit' = IF oldNull /\ status = 409
                    THEN "oldNullBlocked" ELSE IF valid /\ same /\ db.done /\ expected # db.rev /\ status = 200
                    THEN "deliveredRetry" ELSE "other"
    /\ badLock' = (badLock \/ pc # "idle")
    /\ UNCHANGED <<now,issued,db,badAck,badPurge>>
Commit ==
    /\ pc = "update" /\ db' = proposed /\ pc' = "committed"
    /\ issued' = IF proposed.rev > issued THEN proposed.rev ELSE issued
    /\ UNCHANGED <<now,proposed,flags>>
Ack ==
    /\ pc = "committed" /\ pc' = "idle"
    /\ badAck' = (badAck \/ (db # proposed))
    /\ proposed' = Empty /\ UNCHANGED <<now,issued,db,badRev,badReplay,badSame,badLock,badPurge,hit>>
EnterAlarm ==
    /\ pc = "idle" /\ db.rev # 0 /\ pc' = "alarm"
    /\ badLock' = (badLock \/ pc # "idle")
    /\ UNCHANGED <<now,issued,db,proposed,badRev,badReplay,badSame,badAck,badPurge,hit>>
HandleAlarm(close) ==
    /\ pc = "alarm"
    /\ LET purge == db.shape = 0 /\ now >= db.until
           ending == db.shape # 0 /\ close
       IN /\ ~ending \/ issued < Limit
          /\ db' = IF purge THEN Empty ELSE IF ending THEN Closed(issued+1)
                   ELSE IF db.shape # 0 THEN [db EXCEPT !.done = TRUE] ELSE db
          /\ issued' = IF ending THEN issued+1 ELSE issued
          /\ badPurge' = (badPurge \/ (purge /\ now < db.closedAt+Horizon))
          /\ hit' = IF purge THEN "purged" ELSE hit
    /\ pc' = "idle"
    /\ UNCHANGED <<now,proposed,badRev,badReplay,badSame,badAck,badLock>>
Tick == /\ now < End /\ now' = now+1 /\ UNCHANGED <<issued,db,pc,proposed,flags>>
Next == (\E s \in 0..4, e \in 0..Limit : Begin(s,e)) \/ Commit \/ Ack \/ EnterAlarm
        \/ (\E close \in BOOLEAN : HandleAlarm(close)) \/ Tick \/ UNCHANGED vars
Spec == Init /\ [][Next]_vars
RevisionGuards == ~badRev
NoNullReplayAfterClose == ~badReplay
ExactRetryUnchanged == ~badSame
AckAfterCommit == ~badAck
ExclusiveOperations == ~badLock
TombstoneLifetime == ~badPurge
OldNullBlocked == hit = "oldNullBlocked"
AckedPartialRetry == hit = "deliveredRetry"
ClosedStatePurged == hit = "purged"
========================================================================
