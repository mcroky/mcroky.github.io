---------------------------- MODULE PushArchive ----------------------------
EXTENDS Integers, Sequences, FiniteSets, TLC
CONSTANTS Cap, PageSize, Count
VARIABLES started, completed, pending, failures, committed, rows
delivery == <<started, completed>>
storage == <<committed, rows>>
effects == <<pending, failures>>
vars == <<delivery, storage, effects>>

\* Source read at push-server/worker.js blob 933b2b647099a2cd2ceae78f8f520c1b46eb8a3c
\* lines 15-21, 48-66, 182-189, and push-server/admin/viewer.mjs blob
\* cddddd29b25be5826bd661acbb16f379da03c063 lines 56-68 and 72.
\* One delivery flow logs a bounded sequence of results; pending waitUntil
\* appends may resolve out of order while delivery continues. A request can
\* fail before it is queued or inside the SQL transaction. SQLite assigns
\* increasing row IDs and exposes insert+trim as one atomic operation.
\* Each event has a symbolic timestamp, an opaque payload and a commit ID.
\* Abstract one KST day as [1,3), the actual 10000-row cap and 100+1
\* page size as small constants. Every query evaluates one committed state.
\* No cross-page snapshot, eventual archival, actual delivery success,
\* SQL implementation, wall-clock computation, or platform fairness is assumed.

DayStart == 1
DayEnd == 3
Timeline == SubSeq(<<1, 3, 1, 2, 0>>, 1, Count)
Events == 1..Len(Timeline)
Min(a, b) == IF a < b THEN a ELSE b
NewRow(event) == [id |-> Len(committed) + 1, at |-> Timeline[event], payload |-> event]

Init == /\ started = 0 /\ completed = 0
        /\ pending = {} /\ failures = {}
        /\ committed = <<>> /\ rows = <<>>

Emit ==
    /\ started = completed /\ started < Len(Timeline)
    /\ started' = started + 1
    /\ \/ /\ pending' = pending \cup {started'} /\ UNCHANGED failures
       \/ /\ failures' = failures \cup {started'} /\ UNCHANGED pending
    /\ UNCHANGED <<completed, storage>>

FinishDelivery ==
    /\ completed < started
    /\ completed' = completed + 1
    /\ UNCHANGED <<started, storage, effects>>

Commit(item) ==
    /\ item \in pending
    /\ LET row == NewRow(item)
       IN /\ committed' = Append(committed, row)
          /\ rows' = SelectSeq(Append(rows, row), LAMBDA entry: entry.id > row.id - Cap)
    /\ pending' = pending \ {item}
    /\ UNCHANGED <<delivery, failures>>

Fail(item) ==
    /\ item \in pending
    /\ pending' = pending \ {item} /\ failures' = failures \cup {item}
    /\ UNCHANGED <<delivery, storage>>

Done == /\ completed = Len(Timeline) /\ pending = {} /\ UNCHANGED vars
Next == Emit \/ FinishDelivery \/ Done
        \/ \E item \in Events: Commit(item) \/ Fail(item)
Spec == Init /\ [][Next]_vars

DayRows == SelectSeq(rows, LAMBDA row: row.at >= DayStart /\ row.at < DayEnd)
NewestFirst(a, b) == a.at > b.at \/ (a.at = b.at /\ a.id > b.id)
Ordered == SortSeq(DayRows, NewestFirst)
Pages == 0..(Len(Timeline) \div PageSize)
Query(offset) == SubSeq(Ordered, offset + 1, Min(Len(Ordered), offset + PageSize + 1))
Display(result) == SubSeq(result, 1, Min(Len(result), PageSize))
HasMore(result) == Len(result) > PageSize

CommittedTail ==
    rows = SubSeq(committed, IF Len(committed) <= Cap THEN 1 ELSE Len(committed) - Cap + 1,
                  Len(committed))

HalfOpenDay ==
    { Ordered[i] : i \in 1..Len(Ordered) }
    = { rows[i] : i \in {j \in 1..Len(rows): DayStart <= rows[j].at /\ rows[j].at < DayEnd} }

StableNewestOrder ==
    \A i \in 2..Len(Ordered):
        LET before == Ordered[i-1] after == Ordered[i]
        IN \/ before.at > after.at
           \/ before.at = after.at /\ before.id > after.id

PageAndLookahead ==
    \A page \in Pages:
        LET offset == page * PageSize
            result == Query(offset)
            remaining == IF Len(Ordered) > offset THEN Len(Ordered) - offset ELSE 0
        IN /\ Len(result) = Min(PageSize + 1, remaining)
           /\ Display(result) = SubSeq(Ordered, offset + 1, Min(Len(Ordered), offset + PageSize))
           /\ HasMore(result) = (remaining > PageSize)

OnlyDeliveryCompletes == [][(completed' # completed) => FinishDelivery]_vars

Trimmed == Len(committed) > Cap /\ Len(rows) = Cap
CompletedWithPending == completed > 0 /\ started = completed /\ pending # {}
FailedButCompleted == \E item \in failures: item <= completed
EqualTimestamp == \E i \in 2..Len(Ordered): Ordered[i-1].at = Ordered[i].at
DayBoundary ==
    /\ \E i \in 1..Len(rows): rows[i].at = DayEnd
    /\ \E i \in 1..Len(Ordered): Ordered[i].at = DayStart
ExtraRow == Len(Query(0)) = PageSize + 1 /\ HasMore(Query(0))
SecondPage == Len(Display(Query(PageSize))) > 0

=============================================================================
