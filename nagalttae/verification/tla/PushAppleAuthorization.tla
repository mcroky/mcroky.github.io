---- MODULE PushAppleAuthorization ----
EXTENDS Naturals

\* Source read at push-server/worker.js blob c5d3604c583a63a4aefee9672179f795014bf0d1.
\* Lines 9-13, 44-69 and 133-151: shared signer selection, durable keys,
\* serialized Apple authorization lookup/refresh, and outbound usage.
\* Each device starts at most one Apple request. An optional warm cache is
\* a previous completed request. A single signer restart may occur between
\* critical sections. Storage puts settle successfully (atomically) or
\* reject before changing storage. Keys are abstract identity numbers.
\* Clock is monotonic in whole hours, bounded to three hours in the matrix;
\* no whole-hour tick occurs inside one token critical section (production
\* timeout is 30 seconds). Cryptographic correctness, clock jumps, and the
\* alarm's grace period and transport behavior are outside this model.
\* Weak fairness applies only after a caller starts, assuming a serialized
\* storage step can succeed or fail; nobody is required to start a request.
\* restarted.returnedBefore is a witness of which RPCs returned before restart.

CONSTANTS Clients, EndHour, Warm
VARIABLES now, keys, latestKey, cache, lastPersisted, published, gapOK, restarted,
          lock, pc, obtainedKey, seen, selected, returned, sent
durable == <<keys, latestKey, cache, lastPersisted, published, gapOK>>
caller == <<pc, obtainedKey, seen, selected, returned, sent>>
vars == <<now, durable, restarted, lock, caller>>

Token(generation, keyId, issued) == [id |-> generation, key |-> keyId, from |-> issued,
  refreshAt |-> issued + 2, expires |-> issued + 12,
  aud |-> "https://web.push.apple.com", sub |-> "https://mcroky.github.io/nagalttae/"]
None == Token(0, 0, 0)
CanReuse(entry, time) == entry.id # 0 /\ entry.refreshAt > time
FreshHeader(generation, keyId, time) == Token(generation, keyId, time)

Init == /\ now = 0
        /\ keys = IF Warm THEN 1 ELSE 0
        /\ latestKey = keys
        /\ cache = IF Warm THEN Token(1, 1, 0) ELSE None
        /\ lastPersisted = cache
        /\ published = cache.id
        /\ gapOK = TRUE
        /\ restarted = [done |-> FALSE, returnedBefore |-> {}]
        /\ lock = 0
        /\ pc = [w \in Clients |-> "idle"]
        /\ obtainedKey = [w \in Clients |-> 0]
        /\ seen = [w \in Clients |-> None]
        /\ selected = [w \in Clients |-> None]
        /\ returned = [w \in Clients |-> None]
        /\ sent = [w \in Clients |-> None]

Start(w) == /\ pc[w] = "idle"
            /\ pc' = [pc EXCEPT ![w] = "keys"]
            /\ UNCHANGED <<now, durable, restarted, lock, obtainedKey, seen, selected, returned, sent>>

GetKeys(w) ==
  /\ pc[w] = "keys" /\ lock = 0
  /\ keys' = IF keys = 0 THEN latestKey + 1 ELSE keys
  /\ latestKey' = keys'
  /\ obtainedKey' = [obtainedKey EXCEPT ![w] = keys']
  /\ pc' = [pc EXCEPT ![w] = "queued"]
  /\ UNCHANGED <<now, cache, lastPersisted, published, gapOK, restarted,
                 lock, seen, selected, returned, sent>>

Acquire(w) == /\ pc[w] = "queued" /\ lock = 0
              /\ lock' = w /\ pc' = [pc EXCEPT ![w] = "decide"]
              /\ UNCHANGED <<now, durable, restarted, obtainedKey, seen, selected, returned, sent>>

Decide(w) ==
  /\ lock = w /\ pc[w] = "decide"
  /\ seen' = [seen EXCEPT ![w] = cache]
  /\ IF CanReuse(cache, now)
     THEN /\ selected' = [selected EXCEPT ![w] = cache]
          /\ pc' = [pc EXCEPT ![w] = "committed"]
     ELSE /\ selected' = [selected EXCEPT ![w] = FreshHeader(published + 1, obtainedKey[w], now)]
          /\ pc' = [pc EXCEPT ![w] = "staged"]
  /\ UNCHANGED <<now, durable, restarted, lock, obtainedKey, returned, sent>>

Persist(w) ==
  /\ lock = w /\ pc[w] = "staged"
  /\ cache' = selected[w] /\ lastPersisted' = cache' /\ published' = cache'.id
  /\ gapOK' = gapOK /\ (published = 0 \/ cache'.from >= lastPersisted.from + 2)
  /\ pc' = [pc EXCEPT ![w] = "committed"]
  /\ UNCHANGED <<now, keys, latestKey, restarted, lock, obtainedKey, seen, selected, returned, sent>>

FailWrite(w) ==
  /\ lock = w /\ pc[w] = "staged"
  /\ lock' = 0 /\ pc' = [pc EXCEPT ![w] = "error"]
  /\ UNCHANGED <<now, durable, restarted, obtainedKey, seen, selected, returned, sent>>

Return(w) ==
  /\ lock = w /\ pc[w] = "committed"
  /\ returned' = [returned EXCEPT ![w] = selected[w]]
  /\ lock' = 0 /\ pc' = [pc EXCEPT ![w] = "send"]
  /\ UNCHANGED <<now, durable, restarted, obtainedKey, seen, selected, sent>>

Send(w) ==
  /\ pc[w] = "send"
  /\ sent' = [sent EXCEPT ![w] = returned[w]]
  /\ pc' = [pc EXCEPT ![w] = "done"]
  /\ UNCHANGED <<now, durable, restarted, lock, obtainedKey, seen, selected, returned>>

Restart == /\ ~restarted.done /\ lock = 0
           /\ restarted' = [done |-> TRUE, returnedBefore |-> {w \in Clients : returned[w].id # 0}]
           /\ UNCHANGED <<now, durable, lock, caller>>

Tick == /\ now < EndHour /\ lock = 0 /\ now' = now + 1
        /\ UNCHANGED <<durable, restarted, lock, caller>>

ResolveWrite(w) == Persist(w) \/ FailWrite(w)
Next == \/ \E w \in Clients : Start(w) \/ GetKeys(w) \/ Acquire(w) \/ Decide(w)
                                 \/ ResolveWrite(w) \/ Return(w) \/ Send(w)
        \/ Restart \/ Tick \/ UNCHANGED vars
Spec == /\ Init /\ [][Next]_vars
        /\ \A w \in Clients : WF_vars(GetKeys(w)) /\ WF_vars(Acquire(w)) /\ WF_vars(Decide(w))
                             /\ WF_vars(ResolveWrite(w)) /\ WF_vars(Return(w)) /\ WF_vars(Send(w))

LockedStates == {"decide", "staged", "committed"}
TypeOK == /\ now \in 0..EndHour /\ lock \in Clients \cup {0}
          /\ restarted \in [done : BOOLEAN, returnedBefore : SUBSET Clients]
          /\ pc \in [Clients -> {"idle", "keys", "queued", "decide", "staged", "committed", "send", "done", "error"}]
ExclusiveSigner == \A w \in Clients : (pc[w] \in LockedStates) = (lock = w)
PersistentIdentity == /\ keys = latestKey /\ keys \in {0, 1}
                      /\ \A w \in Clients : obtainedKey[w] \in {0, keys}
DurableAcrossRestart == cache = lastPersisted
MinimumRefreshGap == /\ gapOK
                     /\ \A w \in Clients : pc[w] = "staged" /\ seen[w].id # 0 =>
                                           selected[w].from >= seen[w].from + 2
RefreshDecisions == \A w \in Clients : pc[w] \in {"staged", "committed"} =>
  IF seen[w].id # 0 /\ now < seen[w].from + 2 THEN selected[w] = seen[w]
  ELSE /\ selected[w].id > seen[w].id
       /\ selected[w].from = now

ReturnedAfterCommit == \A w \in Clients : pc[w] \in {"send", "done"} =>
  /\ returned[w].id \in 1..published
  /\ returned[w].id = published => returned[w] = lastPersisted

CorrectAuthorization(entry) == entry.id # 0 =>
  /\ entry.key = keys
  /\ entry.aud = "https://web.push.apple.com"
  /\ entry.sub = "https://mcroky.github.io/nagalttae/"
  /\ entry.refreshAt = entry.from + 2
  /\ entry.expires = entry.from + 12 /\ entry.expires < entry.from + 24
HeaderLifetime == \A w \in Clients : CorrectAuthorization(selected[w]) /\ CorrectAuthorization(sent[w])
UsesSharedHeader == \A w \in Clients : pc[w] = "done" => sent[w] = returned[w]
RequestFinishes == \A w \in Clients : pc[w] \notin {"idle", "done", "error"} ~> pc[w] \in {"done", "error"}

BothRefreshWait == \E a, b \in Clients : a # b /\ pc[a] = "staged" /\ pc[b] = "queued"
WarmRefreshCompetition == now = 2 /\ published = 1 /\ BothRefreshWait
SameHeader == \E a, b \in Clients : a # b /\ pc[a] = "done" /\ pc[b] = "done" /\ sent[a] = sent[b]
FreshBeforeBoundary == \E w \in Clients : pc[w] = "committed" /\ now = 1
                         /\ seen[w].id = 1 /\ selected[w] = seen[w]
RefreshAtBoundary == \E w \in Clients : pc[w] = "staged" /\ now = 2
                       /\ seen[w].id = 1 /\ selected[w].id = 2
ReuseAcrossRestart == /\ restarted.done /\ published = 1
                      /\ \E a, b \in Clients : a # b /\ pc[a] = "done" /\ pc[b] = "done"
                                              /\ a \in restarted.returnedBefore /\ b \notin restarted.returnedBefore
                                              /\ sent[a] = sent[b]
FailedWhileCold == published = 0 /\ \E w \in Clients : pc[w] = "error" /\ returned[w] = None
====
