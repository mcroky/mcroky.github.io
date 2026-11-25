----------------------------- MODULE SavedPlans -----------------------------
EXTENDS Naturals
CONSTANT Tabs, Ids, Budget
VARIABLES records, allocated, started, pending, seen, drafts, last
vars == <<records, allocated, started, pending, seen, drafts, last>>

\* Source read at session-plan.js blob 169b60c466d0f30b913247447b301a038cd7383e,
\* lines 16-41 (drafts) and 44-105 (withPlans/readSavedPlans/writeSavedPlan/changeSavedPlan).
\* Models the saved-plan IndexedDB store shared by browser tabs. A list
\* snapshot is represented by one row the UI can choose. A write captures
\* that row's revision and, for create/edit, the initiating tab's draft.
\* A commit reads the current record and atomically commits that write in
\* one serialized readwrite transaction. Abort leaves the store unchanged.
\* UUID generation is modeled as a fresh allocation even if the call later
\* aborts. The model is bounded by Tabs, Ids and the total starts in Budget.
\* Payloads represent distinct validated plans. IndexedDB isolation, UUID
\* randomness, payload validation and browser persistence are assumptions.

TabIds == 1..Tabs
RecordIds == 1..Ids
Plans == {1, 2}
Kinds == {"create", "edit", "delete"}
Empty == [revision |-> 0, value |-> 0]
BlankStore == [id \in RecordIds |-> Empty]
EmptySnapshot == [id |-> 0, revision |-> 0]
Idle == [kind |-> "none", id |-> 0, expected |-> 0, value |-> 0]
Write(kind, id, expected, value) ==
    [kind |-> kind, id |-> id, expected |-> expected, value |-> value]

Event(action, tab, op, result) ==
    [action |-> action, tab |-> tab, write |-> op, result |-> result,
     before |-> records, beforeDrafts |-> drafts]

Init == /\ records = BlankStore /\ allocated = {} /\ started = 0
        /\ pending = [tab \in TabIds |-> Idle]
        /\ seen = [tab \in TabIds |-> EmptySnapshot]
        /\ drafts = [tab \in TabIds |-> 1]
        /\ last = [action |-> "init", tab |-> 0, write |-> Idle, result |-> "none",
                   before |-> BlankStore, beforeDrafts |-> drafts]

Snapshot(store, id) ==
    IF store[id].revision # 0 THEN [id |-> id, revision |-> store[id].revision]
    ELSE EmptySnapshot

Read(tab, id) ==
    /\ pending[tab] = Idle
    /\ seen' = [seen EXCEPT ![tab] = Snapshot(records, id)]
    /\ last' = Event("read", tab, Write("none", id, 0, 0), "none")
    /\ UNCHANGED <<records, allocated, started, pending, drafts>>

Draft(tab, value) ==
    /\ value # drafts[tab]
    /\ drafts' = [drafts EXCEPT ![tab] = value]
    /\ last' = Event("draft", tab, Idle, "none")
    /\ UNCHANGED <<records, allocated, started, pending, seen>>

CanStart(tab) == started < Budget /\ pending[tab] = Idle
StartCreate(tab, id) ==
    /\ CanStart(tab) /\ id \notin allocated
    /\ allocated' = allocated \cup {id}
    /\ pending' = [pending EXCEPT ![tab] = Write("create", id, 0, drafts[tab])]
    /\ started' = started + 1
    /\ last' = Event("start", tab, pending'[tab], "none")
    /\ UNCHANGED <<records, seen, drafts>>

StartChange(tab, kind) ==
    /\ CanStart(tab) /\ seen[tab].revision # 0
    /\ LET value == IF kind = "edit" THEN drafts[tab] ELSE 0
       IN pending' = [pending EXCEPT ![tab] = Write(kind, seen[tab].id, seen[tab].revision, value)]
    /\ started' = started + 1
    /\ last' = Event("start", tab, pending'[tab], "none")
    /\ UNCHANGED <<records, seen, allocated, drafts>>

CanApply(op) ==
    IF op.kind = "create" THEN records[op.id].revision = 0
    ELSE records[op.id].revision # 0 /\ records[op.id].revision = op.expected

NewRecord(op) ==
    CASE op.kind = "delete" -> Empty
      [] op.kind = "create" -> [revision |-> 1, value |-> op.value]
      [] OTHER -> [revision |-> records[op.id].revision + 1, value |-> op.value]

Finish(tab, outcome) ==
    /\ pending[tab] # Idle
    /\ LET op == pending[tab]
           result == CASE outcome = "abort" -> "aborted"
                       [] CanApply(op) -> "saved"
                       [] records[op.id].revision = 0 -> "missing"
                       [] OTHER -> "stale"
       IN /\ records' = IF result = "saved" THEN [records EXCEPT ![op.id] = NewRecord(op)] ELSE records
          /\ last' = Event("finish", tab, op, result)
    /\ pending' = [pending EXCEPT ![tab] = Idle]
    /\ UNCHANGED <<allocated, started, seen, drafts>>

Next == \/ \E tab \in TabIds, id \in RecordIds : Read(tab, id) \/ StartCreate(tab, id)
        \/ \E tab \in TabIds, value \in Plans : Draft(tab, value)
        \/ \E tab \in TabIds, kind \in {"edit", "delete"} : StartChange(tab, kind)
        \/ \E tab \in TabIds, outcome \in {"commit", "abort"} : Finish(tab, outcome)
Spec == Init /\ [][Next]_vars

TypeOK == /\ records \in [RecordIds -> [revision : 0..Budget, value : Plans \cup {0}]]
          /\ allocated \subseteq RecordIds /\ started \in 0..Budget
          /\ drafts \in [TabIds -> Plans]
          /\ seen \in [TabIds -> [id : RecordIds \cup {0}, revision : 0..Budget]]
          /\ pending \in [TabIds -> [kind : Kinds \cup {"none"}, id : RecordIds \cup {0},
                                     expected : 0..Budget, value : Plans \cup {0}]]
          /\ \A id \in RecordIds : (records[id].revision = 0) = (records[id].value = 0)

CreateAllocationsUnique ==
    /\ \A id \in RecordIds : records[id].revision > 0 => id \in allocated
    /\ \A left, right \in TabIds :
        left # right /\ pending[left].kind = "create" /\ pending[right].kind = "create" =>
        pending[left].id # pending[right].id
    /\ last.action = "start" /\ last.write.kind = "create" => last.write.id \in allocated

Committed == last.action = "finish" /\ last.result = "saved"
PriorRevision == last.before[last.write.id].revision
CommitRequiresCurrentRevision ==
    Committed =>
        IF last.write.kind = "create" THEN PriorRevision = 0
        ELSE PriorRevision # 0 /\ PriorRevision = last.write.expected

RejectedWritesPreserveStore ==
    last.action = "finish" /\ last.result \in {"aborted","missing","stale"} => records = last.before

CommitChangesOnlyTarget ==
    Committed =>
        \A other \in RecordIds \ {last.write.id} : records[other] = last.before[other]

CommitReflectsOperation ==
    Committed =>
        records[last.write.id] = CASE last.write.kind = "delete" -> Empty
                                   [] last.write.kind = "create" -> [revision |-> 1, value |-> last.write.value]
                                   [] OTHER -> [revision |-> last.write.expected + 1, value |-> last.write.value]

DraftIsolation ==
    IF last.action = "draft"
    THEN /\ records = last.before
         /\ \A other \in TabIds \ {last.tab} : drafts[other] = last.beforeDrafts[other]
    ELSE drafts = last.beforeDrafts

ReadsReflectStore ==
    last.action = "read" =>
        /\ records = last.before
        /\ seen[last.tab] = Snapshot(last.before, last.write.id)

ConcurrentCreates ==
    \E left, right \in TabIds :
        left # right /\ pending[left].kind = "create" /\ pending[right].kind = "create"
TwoRecordsStored == \A id \in RecordIds : records[id].revision > 0
EditedOneOfTwo == Committed /\ last.write.kind = "edit" /\ TwoRecordsStored
StaleEditRejected == last.result = "stale" /\ last.write.kind = "edit"
StaleDeleteRejected == last.result = "stale" /\ last.write.kind = "delete"
MissingEditRejected == last.result = "missing" /\ last.write.kind = "edit"
MissingDeleteRejected == last.result = "missing" /\ last.write.kind = "delete"
AbortedEdit == last.result = "aborted" /\ last.write.kind = "edit"
IndependentDrafts == \E left, right \in TabIds : drafts[left] # drafts[right]
====
