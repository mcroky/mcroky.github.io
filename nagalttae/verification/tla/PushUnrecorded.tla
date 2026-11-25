-------------------------- MODULE PushUnrecorded ---------------------------
EXTENDS Integers
VARIABLES source, archive, now
vars == <<source, archive, now>>

\* Source read at push-server/worker.js blob d849e40d2efe59bea9f68358fce864196916bfb8,
\* lines 29-48 (unrecordedReminders), 83-93 (reminderPage).
\* Every initial state is one immutable read snapshot. The page time is
\* shared by all rows; archive visibility, SQL ordering, and write progress
\* are covered by PushArchive. Time comparisons use representative integer
\* ticks with a grace of two ticks rather than five minutes. A sentinel
\* stands for an invalid or absent time. Related rows may be on any day.
\* The view is evidence about archived records, not about actual delivery.

Ids == {"subject", "other"}
Kinds == {"ready", "leave", "both"}
Outcomes == {"provider_accepted", "provider_rejected", "expired", "send_error"}
Grace == 2
Missing == -1

Schedule(event, outcome, id, pending, ready, leave) ==
    [event |-> event, outcome |-> outcome, id |-> id, pending |-> pending,
     ready |-> ready, leave |-> leave]

Sources ==
    { Schedule("schedule", "saved", "subject", {"ready", "leave"}, 2, 4),
      Schedule("schedule", "saved", "subject", {"leave"}, 2, 4),
      Schedule("schedule", "saved", "subject", {"both"}, 4, 4),
      Schedule("schedule", "saved", "subject", {}, 2, 4),
      Schedule("schedule", "saved", "subject", {"ready", "leave"}, Missing, 4),
      Schedule("schedule", "saved", "subject", {"ready", "leave"}, 2, Missing),
      Schedule("schedule", "unchanged", "subject", {"ready", "leave"}, 2, 4),
      Schedule("schedule", "saved", "", {"ready", "leave"}, 2, 4),
      Schedule("delivery", "saved", "subject", {"ready", "leave"}, 2, 4) }

Entry(event, outcome, id, previous, kind) ==
    [event |-> event, outcome |-> outcome, id |-> id, previous |-> previous, kind |-> kind]

Delivery(id, kind, outcome) == Entry("delivery", outcome, id, "", kind)
Reports == { Delivery(id, kind, outcome) : id \in Ids, kind \in Kinds, outcome \in Outcomes }
OtherDiagnostic == Entry("apple_rejection", "recorded", "subject", "", "ready")
ReportSets ==
    { {}, {OtherDiagnostic},
      { Delivery("subject", "ready", "provider_accepted"),
        Delivery("subject", "leave", "provider_rejected") } }
    \cup { {record} : record \in Reports }

Cancel(id, outcome) == Entry("cancel", outcome, id, "", "")
Replacement(previous, outcome) == Entry("schedule", outcome,
    IF previous = "subject" THEN "other" ELSE "subject", previous, "")
EndSets ==
    { {} }
    \cup { {Cancel(id, outcome)} : id \in Ids, outcome \in {"canceled", "rejected"} }
    \cup { {Replacement(id, outcome)} : id \in Ids, outcome \in {"saved", "unchanged"} }

Init == /\ source \in Sources
        /\ archive \in { reports \cup endings : reports \in ReportSets, endings \in EndSets }
        /\ now \in {1} \cup (3..7)

Next == UNCHANGED vars
Spec == Init /\ [][Next]_vars

SavedSource == source.event = "schedule" /\ source.outcome = "saved" /\ source.id # ""
Due(kind) == IF kind = "ready" THEN source.ready ELSE source.leave
Overdue == { kind \in source.pending :
    LET at == Due(kind) IN at # Missing /\ now >= at + Grace }
Related == { r \in archive : r.id = source.id \/ r.previous = source.id }
Ended ==
    \E record \in Related:
        \/ /\ record.event = "cancel" /\ record.id = source.id /\ record.outcome = "canceled"
        \/ /\ record.event = "schedule" /\ record.previous = source.id /\ record.outcome = "saved"
Seen ==
    { record.kind : record \in { r \in Related : r.event = "delivery" /\ r.id = source.id } }
Unrecorded == IF SavedSource /\ ~Ended THEN Overdue \ Seen ELSE {}

OnlySavedSchedule ==
    Unrecorded # {} => source.event = "schedule" /\ source.outcome = "saved" /\ source.id # ""

OnlyDuePending ==
    \A kind \in Unrecorded:
        LET at == IF kind = "ready" THEN source.ready ELSE source.leave
        IN /\ kind \in source.pending /\ at \in 2..4 /\ at <= now - Grace

NoMarkForArchivedDelivery ==
    \A entry \in archive:
        entry.event = "delivery" /\ entry.id = source.id => entry.kind \notin Unrecorded

TerminalSuppresses ==
    \A entry \in archive:
        (entry.event = "cancel" /\ entry.outcome = "canceled" /\ entry.id = source.id)
        \/ (entry.event = "schedule" /\ entry.outcome = "saved" /\ entry.previous = source.id)
        => Unrecorded = {}

FlagsEveryMissingKind ==
    \A kind \in source.pending:
        LET at == IF kind = "ready" THEN source.ready ELSE source.leave
        IN ( /\ source.event = "schedule" /\ source.outcome = "saved" /\ source.id # ""
             /\ at \in 2..4 /\ at <= now - Grace
             /\ \A entry \in archive:
                   /\ entry # Cancel(source.id, "canceled")
                   /\ entry # Replacement(source.id, "saved")
                   /\ (entry.event = "delivery" /\ entry.id = source.id) => entry.kind # kind )
           => kind \in Unrecorded

Future == SavedSource /\ source.pending = {"ready", "leave"} /\ now = 1 /\ archive = {}
          /\ source.ready = 2 /\ source.leave = 4 /\ Unrecorded = {}
BeforeGrace == SavedSource /\ source.pending = {"ready", "leave"} /\ now = 3 /\ archive = {}
               /\ Unrecorded = {}
GraceBoundary == SavedSource /\ source.pending = {"ready", "leave"} /\ now = 4
                 /\ source.ready = 2 /\ archive = {} /\ Unrecorded = {"ready"}
Partial == source.pending = {"ready", "leave"} /\ now = 6
           /\ Delivery("subject", "ready", "provider_rejected") \in archive
           /\ Unrecorded = {"leave"}
Combined == source.pending = {"both"} /\ now = 6 /\ Unrecorded = {"both"}
Canceled == SavedSource /\ Overdue # {} /\ Cancel("subject", "canceled") \in archive
            /\ Unrecorded = {}
Replaced == SavedSource /\ Overdue # {} /\ Replacement("subject", "saved") \in archive
            /\ Unrecorded = {}
Unrelated == Delivery("other", "ready", "provider_accepted") \in archive /\ "ready" \in Unrecorded
DiagnosticOnly == OtherDiagnostic \in archive /\ "ready" \in Unrecorded

=============================================================================
