---
name: stores
description: The in-memory store, writing a durable or foreign store (ports, foldHelper.foldPending, the commit hub, the conformance suite), and testing against the memory store.
metadata:
  purposes: data, planning, test
  mentions: makeMemoryPlanningStore, PlanningStore, foldHelper, makeCommitHub, makeCompositeStore, planningConformance, conformanceCasesFor, planningConformancePlugin, makeProjectionProcessor, @owlmeans/server-planning/store, @owlmeans/server-planning/conformance
---

# @owlmeans/server-planning — Stores

## The memory store

`makeMemoryPlanningStore({ sync?, ids?, now?, seed?, onCommitted?, alias?, schemas? })`

- Cards and projects in one map, specifications in their own, relationships in a third; every read
  goes through the `@owlmeans/resource` query engine. A card list includes specifications only when
  the criteria asks for `kind: specification` or a `category` (`wantsSpecifications`, the rule every
  store routes by).
- `schemas: true` adds the data-defined schema port (records per layer, a revision per
  organization, synchronous `watch`); off by default — without it every type and flow resolves
  from code.
- `sync` (default) folds, publishes and runs `committed` inside `project()`, serialized per card.
  `sync: false` folds nothing until `flush(card?)` — a queued store's shape, for tests that need a
  commit to stay pending.
- A project `delete` purges the project, everything whose `parents` reach it, their specifications,
  links and log; the commit hub remembers the settled event so the waiter still gets its answer.
- **It is wrong for more than one process or a restart** — the log, the cards and the commit feed
  are this process's heap. Use it for tests, tools and single-process demos.

## Writing a durable store

- Implement `PlanningStore` (`transitions`, `cards`, `specs`, `links`, `commits`, `newId`). `newId`
  answers the id format the host's references need (ObjectId hex for Mongo).
- `transitions.list` treats `sinceSeq` as `seq > sinceSeq`; `nextSeq` is the CAS against `head` and
  answers 1 for a card that has no log.
- The projection body is `foldHelper.foldPending(store, cardId, entityId, { onCommitted, publish, touch, limit })`:
  it applies pending transitions with `applyHelper.applyTransition` only, marks each committed or failed,
  publishes, then runs `onCommitted`. The caller owns single flight per card. Strip `record` from
  the event before a cross-process bus.
- **A failed transition never blocks the card.** The fold marks it `failed`, publishes a failed
  event, and goes PAST it: the card's `seq` advances to that transition with every other value as
  it was, and the next transition folds normally. Without that, every later transition fails as
  out of order and the card is stuck for good. Only two cases stop short: a failed `create` leaves
  no card to advance, and a store that refuses the advancing write stops the fold with `followUp`,
  leaving the rest pending for a retry. `foldHelper.revisionsFromLog` replays past failed transitions the same
  way.
- A transactional store passes `FoldOptions.unit` — it wraps each transition's writes (a
  savepoint), so a write the database refuses is undone whole and the fold marks that transition
  failed and goes past it. `foldHelper.foldPending` folds PAST a failure it produces; a row that is ALREADY
  failed at the cursor, or a gap in the seqs, is the store's to step over before calling it
  (`planning-postgres` does it in a prelude).
- `foldHelper.failPending` is what a dead projection job must do, or waiters hang to their timeout.
- The data-defined schema port (`schemas`) is optional; `makeCompositeStore` passes the default
  store's through. A store that has it must purge a project's layer with the project.
- **Run the conformance suite.** `@owlmeans/server-planning/conformance` exports
  `planningConformance` — named cases with no test runner inside (each throws
  `ConformanceFailure`) — and `conformanceCasesFor(store)`, which drops the data-defined cases for a
  store without the port. Boot a service with `planningConformancePlugin` and `conformanceClock()`
  and hand each case `{ service, store, facade }`; every case works in its own organization, so one
  boot serves them all.
- `makeCommitHub({ status, remember?, ladder? })` is the `CommitSource`: feed `publish` from the bus,
  answer `status` from transition rows. `wait` subscribes first, polls once, then climbs the ladder.
- `foldHelper.revisionsFromLog(transitions, limit?)` answers `specs.revisions`.
- `makeProjectionProcessor(ctx)` + `makePlanningQueueHooks(ctx)` are the store-agnostic job body and
  `onJobDead`; a store with an admission CAS wraps its own around them.

## A foreign provider

Only `cards` is required. A plugin that `owns` its types and supplies a store without
`transitions` can be read through the facade; writes to it refuse with `PlanningUnsupported` —
mapping external records (`mappers`) belongs to that plugin's own store adapter.

## Testing

Category A. Build one real context with `makeBasicContext` + `appendPlanningService({ store:
makeMemoryPlanningStore({ now }), plugins: [fixtures] })`, and run a handler through
`handler.bind({ ref: { ctx } })(req, res)` with a request carrying `auth` and `entity`. A monotonic
`now` keeps log order deterministic; `sync: false` + `flush()` pins pending and hook-count cases.
`tests/conformance.spec.ts` runs the conformance suite against the memory store with and without
`schemas: true`; a durable store's own tests run the same cases against a real database.
