---- MODULE PushAppleReason ----
EXTENDS Naturals

\* Source read at worker.js blob 061bc259dd472f13659859fd91e7ea5fbf930463.
\* push-server/worker.js:11-35, 99-164 (logAppleRejection, alarm and readInput);
\* push-server/schedule.js:46-53 (afterAttempt). One subscription. BeginDelivery
\* starts at an already resolved provider outcome; prior network/expiry timing
\* and queue ordering are checked in PushDelivery. The alarm holds its ordinary
\* serialization through CommitDelivery, while a reason reader owns a captured
\* copy of the answer metadata and can finish independently through waitUntil.
\* Numbers represent distinct reservation IDs and scheduled instants. The
\* allowed code and provider outcomes are representative bounded inputs. An
\* unavailable or malformed body may resolve to a fallback disposition; no
\* fairness or guarantee of Cloudflare log persistence is assumed. resolvedAt
\* is a model-only witness of the active ID at the moment the reader completes.

CONSTANTS Reservations, Attempts
VARIABLES queue, phase, count, attempted, delivery, body, diagnostic
vars == <<queue, phase, count, attempted, delivery, body, diagnostic>>
Indices == 1..Attempts
Kinds == {"ready", "leave"}
OutcomeInputs == {"apple_good", "apple_bad", "apple_gone", "apple_retry",
                  "other_bad", "expired", "transport"}
ReaderInputs == {"recognized", "unknown", "missing", "unreadable"}
Dispositions == {"none", "reading", "recorded", "unrecognized",
                  "missing_or_invalid", "unreadable"}

EmptyMeta == [reservationId |-> 0, kind |-> "none", at |-> 0, status |-> 0]
EmptyDelivery == [meta |-> EmptyMeta, outcome |-> "none", retry |-> FALSE]
EmptyDiagnostic == [meta |-> EmptyMeta, reason |-> "none", disposition |-> "none", resolvedAt |-> 0]
EmptyAttempt == [meta |-> EmptyMeta, input |-> "none"]
NewQueue(last, id, remaining) == [last |-> last, active |-> id, alarms |-> remaining]

HttpCode(input) == CASE input = "apple_good" -> 201
                    [] input = "apple_gone" -> 410
                    [] input = "apple_retry" -> 503
                    [] input \in {"apple_bad", "other_bad"} -> 400
                    [] OTHER -> 0
DeliveryOutcome(input) == CASE input = "apple_good" -> "provider_accepted"
                           [] input = "expired" -> "expired"
                           [] input = "transport" -> "send_error"
                           [] OTHER -> "provider_rejected"
IsAppleRejection(input) == input \in {"apple_bad", "apple_gone", "apple_retry"}
Retry(input) == input \in {"apple_retry", "transport"}
Earliest(alarms) == IF "ready" \in alarms THEN "ready" ELSE "leave"
ScheduledAt(id, kind) == 10 * id + (IF kind = "ready" THEN 1 ELSE 2)
Disposition(p) == CASE p = "recognized" -> "recorded"
                    [] p = "unknown" -> "unrecognized"
                    [] p = "unreadable" -> "unreadable"
                    [] OTHER -> "missing_or_invalid"
SafeValue(p) == IF p = "recognized" THEN "BadTtl" ELSE "none"

Init == /\ queue = NewQueue(0, 0, {})
        /\ phase = "idle"
        /\ count = 0
        /\ attempted = [i \in Indices |-> EmptyAttempt]
        /\ delivery = [i \in Indices |-> EmptyDelivery]
        /\ body = [i \in Indices |-> "none"]
        /\ diagnostic = [i \in Indices |-> EmptyDiagnostic]

Reserve == /\ phase = "idle" /\ queue.last < Reservations
           /\ queue' = NewQueue(queue.last + 1, queue.last + 1, Kinds)
           /\ UNCHANGED <<phase, count, attempted, delivery, body, diagnostic>>

Cancel == /\ phase = "idle" /\ queue.active # 0
          /\ queue' = NewQueue(queue.last, 0, {})
          /\ UNCHANGED <<phase, count, attempted, delivery, body, diagnostic>>

BeginDelivery(input) ==
  /\ phase = "idle" /\ queue.alarms # {} /\ count < Attempts
  /\ LET i == count + 1
         kind == Earliest(queue.alarms)
         meta == [reservationId |-> queue.active, kind |-> kind,
                  at |-> ScheduledAt(queue.active, kind), status |-> HttpCode(input)]
     IN /\ attempted' = [attempted EXCEPT ![i] = [meta |-> meta, input |-> input]]
        /\ delivery' = [delivery EXCEPT ![i] = [meta |-> meta, outcome |-> DeliveryOutcome(input), retry |-> Retry(input)]]
        /\ diagnostic' = IF IsAppleRejection(input)
                         THEN [diagnostic EXCEPT ![i] = [meta |-> meta, reason |-> "none",
                                                        disposition |-> "reading", resolvedAt |-> 0]]
                         ELSE diagnostic
  /\ count' = count + 1
  /\ phase' = "commit"
  /\ UNCHANGED <<queue, body>>

CommitDelivery ==
  /\ phase = "commit"
  /\ LET attempt == attempted[count]
         left == CASE attempt.input = "apple_gone" -> {}
                   [] Retry(attempt.input) -> queue.alarms
                   [] OTHER -> queue.alarms \ {attempt.meta.kind}
     IN queue' = NewQueue(queue.last, IF left = {} THEN 0 ELSE queue.active, left)
  /\ phase' = "idle"
  /\ UNCHANGED <<count, attempted, delivery, body, diagnostic>>

FinishReader(i, input) ==
  /\ diagnostic[i].disposition = "reading"
  /\ body' = [body EXCEPT ![i] = input]
  /\ diagnostic' = [diagnostic EXCEPT ![i] = [meta |-> diagnostic[i].meta,
                     reason |-> SafeValue(input), disposition |-> Disposition(input), resolvedAt |-> queue.active]]
  /\ UNCHANGED <<queue, phase, count, attempted, delivery>>

Done == UNCHANGED vars
Next == \/ Reserve \/ Cancel \/ CommitDelivery
        \/ \E input \in OutcomeInputs : BeginDelivery(input)
        \/ \E i \in Indices : \E input \in ReaderInputs : FinishReader(i, input)
        \/ Done
Spec == Init /\ [][Next]_vars

TypeOK == /\ queue.last \in 0..Reservations /\ queue.active \in 0..queue.last
          /\ queue.alarms \subseteq Kinds /\ (queue.active = 0) = (queue.alarms = {})
          /\ phase \in {"idle", "commit"} /\ count \in 0..Attempts
          /\ \A i \in Indices : diagnostic[i].disposition \in Dispositions

AppleRejectionsOnly ==
  \A i \in Indices : (diagnostic[i].disposition # "none") =
                      (i <= count /\ attempted[i].input \in {"apple_bad", "apple_gone", "apple_retry"})

CapturedMetadata ==
  \A i \in Indices : diagnostic[i].disposition # "none" => diagnostic[i].meta = attempted[i].meta

SafeReasons ==
  \A i \in Indices : LET row == diagnostic[i] IN
    /\ CASE body[i] = "recognized" -> row.reason = "BadTtl" /\ row.disposition = "recorded"
         [] body[i] = "unknown" -> row.reason = "none" /\ row.disposition = "unrecognized"
         [] body[i] = "missing" -> row.reason = "none" /\ row.disposition = "missing_or_invalid"
         [] body[i] = "unreadable" -> row.reason = "none" /\ row.disposition = "unreadable"
         [] OTHER -> row.reason = "none" /\ row.disposition \in {"none", "reading"}

DeliveryIndependent ==
  \A i \in 1..count : LET entry == attempted[i] IN
    /\ delivery[i].meta = entry.meta
    /\ CASE entry.input = "apple_good" -> delivery[i].outcome = "provider_accepted"
         [] entry.input = "transport" -> delivery[i].outcome = "send_error"
         [] entry.input = "expired" -> delivery[i].outcome = "expired"
         [] OTHER -> delivery[i].outcome = "provider_rejected"
    /\ delivery[i].retry = (entry.input \in {"apple_retry", "transport"})

CommitDoesNotWait == phase = "commit" => ENABLED CommitDelivery
ReaderDone(i) == diagnostic[i].disposition = "reading" /\ diagnostic'[i].disposition # "reading"
ReaderDoesNotWrite == [][(\E i \in Indices : ReaderDone(i)) => UNCHANGED <<queue, phase, count>>]_vars

QueueCanAdvance == /\ phase = "idle"
                   /\ \E i \in Indices : diagnostic[i].disposition = "reading"
                                         /\ diagnostic[i].meta.kind \notin queue.alarms
LaterReservationKeepsEarlierReason ==
  \E i \in Indices : diagnostic[i].disposition = "recorded"
                     /\ diagnostic[i].meta.reservationId = 1 /\ diagnostic[i].resolvedAt = 2
TwoReaders == \E i, j \in Indices : i # j /\ diagnostic[i].disposition = "reading"
                                                    /\ diagnostic[j].disposition = "reading"
Recognized == \E i \in Indices : diagnostic[i].disposition = "recorded"
Unknown == \E i \in Indices : diagnostic[i].disposition = "unrecognized"
Missing == \E i \in Indices : diagnostic[i].disposition = "missing_or_invalid"
Unreadable == \E i \in Indices : diagnostic[i].disposition = "unreadable"
OtherFailure == \E i \in 1..count : attempted[i].input = "other_bad" /\ diagnostic[i] = EmptyDiagnostic
====
