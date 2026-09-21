---
name: server-planning
description: How to use @owlmeans/server-planning — appendPlanningService and the plugin registry, the transition executor and its refusal order, the in-memory store, servePlanningEntrypoints and the commit socket, and the ports a durable or foreign provider implements. Auto-invoked when wiring planning into a backend, writing a planning plugin, or diagnosing a transition that was refused or never committed.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-planning

**Layer:** Server
**Install:** `"@owlmeans/server-planning": "^0.1.18-rc.2"` in `dependencies` (`ajv` is a peer)

The general implementation of `@owlmeans/planning`: the planning service (a plugin host), the
scoped facade, the executor every write goes through, the in-memory reference store, the commit
hub and the protocol handlers. It holds no database code — a durable store implements the ports and
reuses the `./store` subpath (`foldPending`, `makeCommitHub`) without pulling fastify in.

## Key exports

| Export | What it is |
|---|---|
| `appendPlanningService(ctx, opts?, alias?)` | Registers the lazy host service and `ctx.planning()` |
| `ensurePlanningService(ctx, alias?)` | Idempotent — what a plugin package calls before `use` |
| `makePlanningService(opts?, alias?)`, `planningServiceApi(opts, self)` | The service, and its body for a specialised service |
| `PlanningServiceOptions` | `{ store?, plugins?, schemas?, hooks?, ids?, now? }` |
| `makePluginRegistry`, `makeStoreFacade`, `executeTransition` | The pieces the service is made of |
| `servePlanningEntrypoints(protocols, opts?)` | One binding per protocol of a `makePlanningProtocols` tree |
| `planningFor(ctx, req, extra?)` | The request-scoped facade for a hand-written handler |
| `PlanningHandlerOptions` | `{ service?, event?, maxPoll?, scope?(req, ctx) }` |
| `listCards` … `executePlanning`, `getCommit`, `watchCommits` | The handlers, to bind one by hand |
| `scopeOf(req, extra?)`, `actorOf(req)`, `concealed(run)`, `clampSeconds` | Scope and security helpers |
| `makeProjectionProcessor(ctx, opts?)`, `planningQueueHooks(ctx, opts?)` | A generic projection job body and its `onJobDead` |
| `./store`: `makeMemoryPlanningStore`, `foldPending`, `failPending`, `revisionsFromLog`, `commitEventOf`, `makeCommitHub`, `makeCompositeStore` | What stores are built from |

## Wiring

```ts
import { appendPlanningService, servePlanningEntrypoints } from '@owlmeans/server-planning'
import { makePlanningProtocols } from '@owlmeans/planning'

// shared package
export const planningProtocols = makePlanningProtocols({
  base: { alias: 'app:planning', path: '/planning', parent: appProtocols.api.base },
  guards: DEFAULT_GUARD,
  socketBase: appProtocols.updates.base,
})

// backend context
appendPlanningService(context, { store: durableStore, plugins: [appTypesPlugin] })

// API process
context.registerEntrypoints(servePlanningEntrypoints(planningProtocols, {
  scope: req => ({ channel: req.auth?.type === AuthroizationType.AuthToken ? 'connect' : 'web' }),
}))
```

- Without `store` the service builds a memory store. The host is a LAZY service so
  `ensurePlanningService(ctx).use(plugin)` works from `makeContext`, before `init()`.
- Call `appendPlanningService` BEFORE any `ensurePlanningService`: `ensure` registers a default
  host when none exists, and a later `append` replaces it together with whatever was `use`d on it.
- In code: `ctx.planning().for({ entityId, profileId?, channel?, actor? })` → a `PlanningFacade`
  with no scope argument on any method.

## The executor, step by step

Nothing is appended before step 11 — every refusal leaves the log untouched.

1. **Normalize** — deep copy, trimmed text, `parents ∋ parent` (first).
2. **Scope** — `entityId` must be present.
3. **Idempotency** — a `key` already in the entity's log answers ITS receipt, before any
   validation or middleware.
4. **Resolve** — the card (`WorkcardNotFound`; another entity's card is `PlanningScopeMismatch`),
   its type and flow, every draft parent (`ParentNotFound`) and the parent project's
   `cardTypes`/`projectTypes` (`CardTypeNotAllowed`), the specification slot.
5. **`before` chain** — in plugin order; re-resolved once when it changed the card, type or parent.
6. **Validate** — shape (`planning:malformed:*`), the flow rule (`IllegalTransition`), immutables
   (`planning:immutable:*`), merged `fields` (`FieldsInvalid`), labels (`LabelNotAllowed`), a moved
   parent, the slot (`SpecificationSlotUnknown`, `SpecificationRevisionConflict`, JSON body schema
   → `FieldsInvalid`), relationships (`RelationshipRefused`: undeclared type, `from` not the card,
   missing target, type constraints, `single`, unlinking an absent edge).
7. **Card id** — `store.newId?.() ?? options.ids?.() ?? uuid()`. Ids are the store's.
8. **Code** — a supplied code is checked; else the plugins' `mintCode` (first answer wins, checked);
   else the type's `CodePolicy` (a slug policy derives from the title) → `CodeTaken`.
9. **Changes** — `computeChanges`. An `update` that changes nothing answers the card's latest
   receipt and appends nothing.
10. **Seq** — `transitions.nextSeq(card, expectSeq)`, a CAS against `head` (`WorkcardConflict`).
11. **Append** — `commit: pending`. A lost race on the key answers the winner's receipt.
12. **Project** — `store.cards.project(card)`: a sync store folds now, a queued one enqueues.
13. **Receipt** — `{ transition, card? (once committed), committed(opts) }`.
14. **`wait: true`** — `committed()` before returning (`CommitTimeout`, `CommitFailed`).

`actor` is the SCOPE's: `profileId`/`userId`/`service`/`channel` come from the scope only; an
in-process caller may add `agent`/`runId` on the execution. A handler never passes a wire `actor`.

## Idempotency and `expectSeq`

- Give every retried or replayed write a `key` (`import:<source>:<n>`). The key is unique per entity
  and checked first, so a retry never re-validates against a card its first attempt already moved.
- `expectSeq` compares against `head`, not `seq`: two writers racing while a fold is pending both
  see the same `seq` but only one wins the head. `null` or omitted opts out; a model fills it from
  its record.

## The plugin seam

| Concern | Rule |
|---|---|
| Registration | `use(plugin)` replaces by `name`; schemas are contributed at `use` time (later type/flow id wins) |
| Order | `order ?? 50` ascending, registration order among equals |
| Store routing | `store(type)` = the first plugin whose `owns(type)` is true AND that supplies a `store`; else the default store. A store factory is resolved once |
| Reads | By id: the default store, then each owned store. A list naming one owned type (or several owned by one store) goes there; any other list — a cross-type query — is the default store's alone |
| `mintCode` | First non-`undefined` answer wins |
| `before` | Every plugin in order; may return a replaced execution; a `ResilientError` passes through, anything else becomes `PlanningRefused('<plugin>:<message>')` |
| `after` | Every plugin in order, once per COMMITTED transition; errors logged, never rethrown |

**Where `after` runs.** The service's `committed(event)` runs the chain, and it is called by the
process that FOLDS the transition — the memory store inside `project()`, a queued store's projection
job after marking the commit. Never subscribe a process to the commit bus to run hooks: that fires
once per subscribed process. Every process that folds registers the same plugins; each commit is
folded by one of them, so each hook fires once. `hooks: false` makes a process fold without running
them. A hook sees `ctx.transition` (read back, so `actor.channel` is available) and a facade scoped
to the event's entity acting as this process's `cfg.service`.

The service hands `committed` to a store through `store.bind?.(listener)` the first time it resolves
the store; `bind` replaces the listener, so a store has exactly one.

## The memory store

`makeMemoryPlanningStore({ sync?, ids?, now?, seed?, onCommitted?, alias? })`

- Cards and projects in one map, specifications in their own, relationships in a third; every read
  goes through the `@owlmeans/resource` query engine. A card list includes specifications only when
  the criteria asks for `kind: specification` or a `category`.
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
- The projection body is `foldPending(store, cardId, entityId, { onCommitted, publish, touch, limit })`:
  it applies pending transitions with `applyTransition` only, marks each committed or failed,
  publishes, then runs `onCommitted`. The caller owns single flight per card. Strip `record` from
  the event before a cross-process bus.
- **A failed transition never blocks the card.** The fold marks it `failed`, publishes a failed
  event, and goes PAST it: the card's `seq` advances to that transition with every other value as
  it was, and the next transition folds normally. Without that, every later transition fails as
  out of order and the card is stuck for good. Only two cases stop short: a failed `create` leaves
  no card to advance, and a store that refuses the advancing write stops the fold with `followUp`,
  leaving the rest pending for a retry. `revisionsFromLog` replays past failed transitions the same
  way.
- `failPending` is what a dead projection job must do, or waiters hang to their timeout.
- `makeCommitHub({ status, remember?, ladder? })` is the `CommitSource`: feed `publish` from the bus,
  answer `status` from transition rows. `wait` subscribes first, polls once, then climbs the ladder.
- `revisionsFromLog(transitions, limit?)` answers `specs.revisions`.
- `makeProjectionProcessor(ctx)` + `planningQueueHooks(ctx)` are the store-agnostic job body and
  `onJobDead`; a store with an admission CAS wraps its own around them.

## A foreign provider

Only `cards` is required. A plugin that `owns` its types and supplies a store without
`transitions` can be read through the facade; writes to it refuse with `PlanningUnsupported` —
mapping external records (`mappers`) belongs to that plugin's own store adapter.

## The commit feed

- **Poll** — `commit.get` answers the status; with `?wait=<s>` (clamped to `maxPoll`, default 55)
  it subscribes, re-polls, and holds until the commit settles or the time is up, answering `pending`
  then — never an error.
- **Notify** — `commit.events` pushes `planning-commit` frames (or `opts.event`) filtered by the
  authenticated entity and optional `project`/`card` query values; a frame without `record` gets the
  card as it reads now. The subscription is released on the socket's `close` frame.
- `execute` with `wait: true` holds at most `maxPoll` seconds whatever `timeout` the body asked for.

## Scope and security

- `entityId` is `requireEntityKey(req)`; `opts.scope(req, ctx)` adds a `channel` or `service` and
  can never replace the entity. `actor` and a create's `createdBy` come from the request, never the
  body.
- Another entity's card, specification or transition answers `WorkcardNotFound` — the same as an
  absent id — on reads and writes alike (`concealed`).
- Queries arrive in their wire form and are decoded with `decode*Query` before `criteriaOf`, which
  always adds the scope's `entityId`.

## Testing

Category A. Build one real context with `makeBasicContext` + `appendPlanningService({ store:
makeMemoryPlanningStore({ now }), plugins: [fixtures] })`, and run a handler through
`handler.bind({ ref: { ctx } })(req, res)` with a request carrying `auth` and `entity`. A monotonic
`now` keeps log order deterministic; `sync: false` + `flush()` pins pending and hook-count cases.

## Related

- `planning` — records, flows, the fold, the query language, the protocol tree, the models
- `client-planning` — the remote facade and the state mirror that talk to these handlers
- `server-job`, `queue` — the declare/serve/feed pattern and the projection queue
- `resource` — the criteria engine every memory read goes through
