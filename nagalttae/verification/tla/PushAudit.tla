----------------------------- MODULE PushAudit -----------------------------
EXTENDS Naturals
CONSTANT Limit
VARIABLES active, issued, phase, request, written, audit
vars == <<active, issued, phase, request, written, audit>>

\* Source read at worker.js blob f1600f847444d351071a09443d18c637dc1e1201,
\* lines 9-11, 43-70, 72-116, 153-176, and schedule.js blob
\* f0b8606665ad6dec03f32b7dc6ee8bb3bae7a9c7, lines 25-53.
\* One subscription under blockConcurrencyWhile, one pending alarm per
\* kind, and at most Limit successful reservation versions. Replacement
\* and cancellation serialize with the alarm. A rejected or repeated
\* request does not write. Save may fail before changing durable state.
\* Timestamps are symbolic and vary by reservation. Treat the second
\* expiry check, request completion and retry cutoff as outcomes from
\* PushDelivery. A log record models what is passed to console.log.
\* Capture, retention, device receipt, and console failure are external.
\* Failure after delivery logging may allow an alarm to retry and log again.

Kinds == {"ready", "leave", "both"}
Outcomes == {"expired", "send_error", "provider_accepted", "provider_rejected"}
Saved == {"saved", "replaced", "canceled"}
Plan(id, pending) == [id |-> id, pending |-> pending]
Empty == Plan(0, {})
Ready(plan) == 10 * plan.id
Leave(plan) == Ready(plan) + (IF plan.pending = {"both"} THEN 0 ELSE 1)
Scheduled(plan, kind) == IF kind = "ready" THEN Ready(plan) ELSE Leave(plan)

NoRequest == [action |-> "", before |-> Empty, after |-> Empty,
              outcome |-> "", kind |-> "", status |-> 0, retry |-> FALSE]
NoAudit == [action |-> "", outcome |-> "", reservationId |-> 0,
            previousId |-> 0, readyAt |-> 0, leaveAt |-> 0, pending |-> {},
            kind |-> "", scheduledAt |-> 0, providerStatus |-> 0, retry |-> FALSE]

Init == /\ active = Empty /\ issued = 0 /\ phase = "idle"
        /\ request = NoRequest /\ written = FALSE /\ audit = NoAudit

BeginUpdate(action, proposed, outcome) ==
    /\ request' = [NoRequest EXCEPT !.action = action, !.before = active,
                    !.after = proposed, !.outcome = outcome]
    /\ phase' = "update"
    /\ UNCHANGED <<active, issued, written, audit>>

Update ==
    /\ phase = "idle"
    /\ \/ /\ issued < Limit
          /\ \E pending \in {{"ready", "leave"}, {"both"}, {"leave"}}:
                BeginUpdate("schedule", Plan(issued + 1, pending),
                            IF active.id = 0 THEN "saved" ELSE "replaced")
       \/ /\ active.id # 0
          /\ BeginUpdate("schedule", active, "unchanged")
       \/ BeginUpdate("schedule", active, "rejected")
       \/ BeginUpdate("cancel", Empty, IF active.id = 0 THEN "no_active_plan" ELSE "canceled")
       \/ BeginUpdate("cancel", active, "rejected")

ResolveUpdate ==
    /\ phase = "update"
    /\ IF request.outcome \in Saved
          THEN /\ active' = request.after
               /\ issued' = IF request.action = "schedule" THEN issued + 1 ELSE issued
               /\ written' = TRUE
          ELSE UNCHANGED <<active, issued, written>>
    /\ phase' = "updateResolved"
    /\ UNCHANGED <<request, audit>>

FailUpdate ==
    /\ phase = "update"
    /\ request.outcome \in Saved
    /\ audit' = [NoAudit EXCEPT !.action = request.action, !.outcome = "server_error"]
    /\ phase' = "updateFailed"
    /\ UNCHANGED <<active, issued, request, written>>

LogUpdate ==
    /\ phase = "updateResolved"
    /\ LET subject == IF request.action = "cancel" THEN request.before
                      ELSE IF request.outcome = "rejected" THEN Empty ELSE request.after
           prior == IF request.outcome = "replaced" THEN request.before.id ELSE 0
           outcome == IF request.outcome = "replaced" THEN "saved" ELSE request.outcome
       IN audit' = [NoAudit EXCEPT !.action = request.action, !.outcome = outcome,
                    !.reservationId = subject.id, !.previousId = prior,
                    !.readyAt = IF subject.id = 0 THEN 0 ELSE Ready(subject),
                    !.leaveAt = IF subject.id = 0 THEN 0 ELSE Leave(subject),
                    !.pending = IF request.action = "schedule" THEN subject.pending ELSE {}]
    /\ phase' = "updateLogged"
    /\ UNCHANGED <<active, issued, request, written>>

Delivery ==
    /\ phase = "idle"
    /\ \E kind \in active.pending:
          \E status \in {0, 201, 404, 429}:
          \E outcome \in CASE status = 0 -> {"expired", "send_error"}
                             [] status = 201 -> {"provider_accepted"}
                             [] OTHER -> {"provider_rejected"}:
          \E retry \in IF status = 429 \/ outcome = "send_error" THEN BOOLEAN ELSE {FALSE}:
              LET pending == IF status = 404 THEN {}
                             ELSE IF retry THEN active.pending ELSE active.pending \ {kind}
                  next == IF pending = {} THEN Empty ELSE Plan(active.id, pending)
              IN request' = [NoRequest EXCEPT !.action = "delivery", !.before = active,
                            !.after = next, !.kind = kind, !.status = status,
                            !.outcome = outcome, !.retry = retry]
    /\ phase' = "deliveryResult"
    /\ UNCHANGED <<active, issued, written, audit>>

LogDelivery ==
    /\ phase = "deliveryResult"
    /\ audit' = [NoAudit EXCEPT !.action = "delivery", !.outcome = request.outcome,
                  !.reservationId = request.before.id, !.kind = request.kind,
                  !.scheduledAt = Scheduled(request.before, request.kind),
                  !.providerStatus = request.status,
                  !.retry = request.kind \in request.after.pending]
    /\ phase' = "deliveryLogged"
    /\ UNCHANGED <<active, issued, request, written>>

FinishDelivery ==
    /\ phase = "deliveryLogged"
    /\ \/ /\ active' = request.after /\ written' = TRUE /\ phase' = "deliverySaved"
       \/ /\ UNCHANGED <<active, written>> /\ phase' = "deliverySaveFailed"
    /\ UNCHANGED <<issued, request, audit>>

Finish ==
    /\ phase \in {"updateLogged", "updateFailed", "deliverySaved", "deliverySaveFailed"}
    /\ phase' = "idle" /\ request' = NoRequest /\ audit' = NoAudit /\ written' = FALSE
    /\ UNCHANGED <<active, issued>>

Next == Update \/ ResolveUpdate \/ FailUpdate \/ LogUpdate \/ Delivery \/ LogDelivery
        \/ FinishDelivery \/ Finish
Spec == Init /\ [][Next]_vars

UpdateSuccessAfterSave ==
    audit.outcome \in {"saved", "canceled"} =>
      written /\ active = request.after

UpdateAssociation ==
    /\ (audit.action = "schedule" /\ audit.outcome \in {"saved", "unchanged"}) =>
        /\ audit.reservationId = request.after.id
        /\ audit.previousId = IF request.outcome = "replaced" THEN request.before.id ELSE 0
        /\ audit.readyAt = Ready(request.after) /\ audit.leaveAt = Leave(request.after)
        /\ audit.pending = request.after.pending
    /\ (audit.action = "cancel" /\ audit.outcome # "server_error") =>
        /\ audit.reservationId = request.before.id
        /\ audit.readyAt = IF request.before.id = 0 THEN 0 ELSE Ready(request.before)
        /\ audit.leaveAt = IF request.before.id = 0 THEN 0 ELSE Leave(request.before)

DeliveryAssociation ==
    audit.action = "delivery" =>
      /\ audit.reservationId = request.before.id /\ audit.kind = request.kind
      /\ audit.scheduledAt = Scheduled(request.before, request.kind)
      /\ audit.retry = request.retry

DeliveryClassification ==
    audit.action = "delivery" =>
      /\ audit.outcome = request.outcome /\ audit.providerStatus = request.status
      /\ (audit.outcome = "provider_accepted") = (audit.providerStatus = 201)

DeliveryRecordedBeforeSave ==
    phase \in {"deliverySaved", "deliverySaveFailed"} => audit.action = "delivery"

Replaced == phase = "updateLogged" /\ request.outcome = "replaced" /\ audit.previousId # 0
CanceledSecond == audit.outcome = "canceled" /\ audit.reservationId = 2 /\ active = Empty
UpdateWriteFailed == phase = "updateFailed" /\ audit.outcome = "server_error"
DeliveryWriteFailed == phase = "deliverySaveFailed" /\ audit.outcome = "provider_accepted"
Expired == audit.action = "delivery" /\ audit.outcome = "expired"
Retry == audit.action = "delivery" /\ audit.retry

=============================================================================
