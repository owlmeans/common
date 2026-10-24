---
name: consistency
description: The fold transaction, healing and recovery, the LISTEN/NOTIFY commit bus, project purge, and the transactional consistency of the auxiliary resources.
metadata:
  purposes: data, planning, ops
  mentions: pg_advisory_xact_lock, LOST_ALLOCATION, planningChannel, DEFAULT_PLANNING_POSTGRES_LIMITS, recover(, makePlanningAssigneePostgres, makePlanningTeamPostgres, makePlanningCommentPostgres, makePlanningMentionPostgres
---

# @owlmeans/planning-postgres — Folds, commits and consistency

## The fold

`project()` folds inline — there is no queued mode. One fold is ONE transaction:

1. `SET LOCAL lock_timeout` (`limits.lockTimeoutMs`), then `pg_advisory_xact_lock` on
   `pgNameHelper.advisoryKey('planning:<qualified card table>:<card id>')`.
2. **The prelude** walks the rows past `card.seq` (at most `foldBatch`): a FAILED row at the cursor
   moves the cursor past it; the PENDING rows from the cursor on are the run the fold takes; a GAP
   — a row past the expected seq, or `head > seq` with no row at all — is an append still in
   flight while younger than `gapGraceMs` (the fold stops; the appender's own `project()` folds
   it), and a lost allocation after that: a failed `lost-allocation` placeholder per missing seq.
   `nextSeq` and `append` are two round trips, so without it a transient gap or an already-failed
   row would turn the next write into a spurious `fold:out-of-order`.
3. `foldHelper.foldPending` of `@owlmeans/server-planning` over a view of the ports bound to the transaction,
   limited to that run, each transition's writes in a SAVEPOINT (`FoldOptions.unit`) — so a write
   the database refuses fails that transition alone and the fold goes past it. Prelude and fold
   repeat within the transaction until the log is folded or a young gap stops it.
4. A `pg_notify` per settled event (no record).
5. COMMIT — and only then the events reach the commit hub and the `after` hooks, in order, outside
   the transaction and the lock. A hook may therefore write to the card it saw commit.

A statement that fails outside a savepoint **poisons** the transaction: it is never committed
(the "transaction is aborted" answers after it are not the cause — the first failure is). The
fold is retried once; failing again, `foldHelper.failPending` fails the card's pending transitions
in a fresh transaction, so no waiter hangs to its timeout. A lock that cannot be taken within
`lockTimeoutMs` means another process is folding the card: nothing is failed, a heal follows.

Allocation: `nextSeq` is a compare-and-set of `head` on the card row, stamping `headAt`; a card
whose create has not folded counts `max(seq) + 1` from the log and the unique `(card, seq)` index
refuses a repeat. A card write never lowers `head` (`GREATEST`) and never touches `headAt`; a write
after the create is an UPDATE of a row that must still exist, so a card purged with its project is
not resurrected by a fold that was already under way.

## Healing and recovery

- **Every waiter heals**: a status read of a pending row older than `healAfterMs` starts a
  background fold of its card (try-lock, deduplicated per card).
- `recover({ olderThanMs = recoverAfterMs, limit = 100 })` folds each card whose oldest pending
  row is older than the threshold (the partial pending index), and runs once in the background on
  the store's first use.
- A lost allocation with no later row is released by the next fold of the card.

## The commit bus

`makeCommitHub` is the commit source; LISTEN/NOTIFY feeds it across processes. The channel is
`planning_<16 hex>` of the qualified transition table, so two schemas in one database never hear
each other. The frame is `{ p: <process id>, t: 'c', e: <CommitEvent without record> }`; a process
ignores its own (`p`) — it delivered it itself, after its commit. LISTEN holds one dedicated
`pg.Client` built from the pool's own configuration (no pool slot), opened on the first subscribe,
wait or schema watch, reconnecting 1 s → 30 s; meanwhile the hub's poll ladder answers every
waiter. A schema write sends `{ t: 's', e: <entityId> }` on the same channel. `bus: false` sends
and hears nothing — waits poll, layers re-read the revision.

## Purge

A project's delete purges in the fold's own transaction. Current card ancestry selects doomed
cards and nested projects; their comments, mentions, documents, links, transitions, project-local
schema layers and projections are removed. Organization assignees and reusable teams survive.
The project's own delete transition stays as its tombstone, so a waiter still reads it committed.

A reparented survivor retains its complete history, documents and edges even when their cached
project id names its former project. Cached project values may select orphaned records, but must
never delete surviving records.

## Native auxiliary resources and transactional consistency

Register stock `makePlanningAssigneeResource`, `makePlanningTeamResource`,
`makePlanningCommentResource` and `makePlanningMentionResource` alongside card, transition, link
and schema resources, or use `appendPostgresPlanning` to register all eight. The default makers
are `makePlanningAssigneePostgres`, `makePlanningTeamPostgres`, `makePlanningCommentPostgres` and
`makePlanningMentionPostgres`. Use one maker per application resource wrapper so discovery sees
each alias. Aux timestamps stay text and versions are native CAS integers.

Assignee nickname and provider/subject, team externalId, and comment/assignee mention pairs have
organization-scoped native unique indexes. Edges include resource kinds; legacy null kinds mean
workcards. All organization units acquire a transaction advisory lock, shared by card folds and
schema writes. Native ports join the current transaction runner. Domain validation, card projection,
field-authoritative links, comment content and derived mention maintenance commit together.
Schema versions and resource versions are compared in SQL, not only before writing.

Deleting a card removes its comments and mention cache. Project purge includes descendants and
project-scoped schema rows, and preserves organization assignees and teams. The shared resource
conformance suite executes against real PostgreSQL, including concurrent CAS and hierarchy checks.
