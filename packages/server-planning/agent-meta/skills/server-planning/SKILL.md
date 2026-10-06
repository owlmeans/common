---
name: server-planning
description: How to use @owlmeans/server-planning — appendPlanningService and the plugin registry, the transition executor and its refusal order, the in-memory store, servePlanningEntrypoints and the commit socket, and the ports a durable or foreign provider implements. Auto-invoked when wiring planning into a backend, writing a planning plugin, or diagnosing a transition that was refused or never committed.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-planning

**Layer:** Server
**Install:** `"@owlmeans/server-planning": "^0.1.18-rc.23"` in `dependencies` (`ajv` is a peer)

The general implementation of `@owlmeans/planning`: the planning service (a plugin host), the
scoped facade, the executor every write goes through, the in-memory reference store, the commit
hub and the protocol handlers. It holds no database code — a durable store implements the ports and
reuses the `./store` subpath (`foldHelper.foldPending`, `makeCommitHub`) without pulling fastify in.

## Key exports

| Export | What it is |
|---|---|
| `appendPlanningService(ctx, opts?, alias?)` | Registers the lazy host service and `ctx.planning()` |
| `ensurePlanningService(ctx, alias?)` | Idempotent — what a plugin package calls before `use` |
| `makePlanningService(opts?, alias?)`, `planningServiceApi(opts, self)` | The service, and its body for a specialised service |
| `PlanningServiceOptions` | `{ store?, plugins?, schemas?, hooks?, ids?, now? }` |
| `makePluginRegistry`, `makeStoreFacade`, `executeTransition` | The pieces the service is made of |
| `creatorHelper` — `.creatorOf(scope)`, `.withCreator(exec, scope)`, `.assertCreatorFixed(exec)` | The subject a create is stamped with as `createdBy`, the defaulting the executor applies, and its refusal of any later move |
| `servePlanningEntrypoints(protocols, opts?)` | One binding per protocol of a `makePlanningProtocols` tree (`schema.define` too when declared) |
| `planningHandlerOf(ctx).planningFor(req, extra?)` | The request-scoped facade for a hand-written handler |
| `PlanningHandlerOptions` | `{ service?, event?, maxPoll?, scope?(req, ctx), access?(req, ctx) }` |
| `PlanningAccessResolver`, `PlanningAccess`, `PlanningAccessGrants`, `PlanningGrant` | The optional access decision a hosting app supplies |
| `listCards` … `executePlanning`, `getCommit`, `watchCommits`, `listSchemas`, `defineSchemas`, `applySchemaRequest` | The handlers, to bind one by hand |
| `makeRequestScope(req)` — `.scopeOf(extra?)`, `.accessScopeOf(access, extra?)`, `.actorOf()`; `planningHandlerOf(ctx).handlerScopeOf`; `makePlanningAccessModel(access)` — `.assertGranted`, `.assertWrites`, `.writableIn`; `executionHelper` — `.assertExecutionGranted`, `.assertExecutionWrites`; `guardHelper` — `.concealed(run)`, `.clampSeconds` | Scope and security helpers |
| `makeDefinitions(runtime, facade)`, `makeSchemaViews(opts)`, `projectCriteriaOf(projects, through?)` | Data-defined schemas and the project narrowing |
| `makeProjectionProcessor(ctx, opts?)`, `makePlanningQueueHooks(ctx, opts?)` | A generic projection job body and its `onJobDead` |
| `./queue`: `declarePlanningQueue(cfg, opts?)`, `PLANNING_PROJECTION_QUEUE` (`planning-projection`), `PLANNING_PROJECT_JOB` (`planning:project`), `ProjectionRequest` | The projection queue's shared address; each process chooses separately whether to listen |
| `./store`: `makeMemoryPlanningStore`, `foldHelper` (`.foldPending`, `.failPending`, `.revisionsFromLog`, `.commitEventOf`), `makeCommitHub`, `makeCompositeStore`, `wantsSpecifications` | What stores are built from |
| `./conformance`: `planningConformance`, `conformanceCasesFor`, `planningConformancePlugin`, `conformanceClock`, `ConformanceFailure` | The store conformance suite, runner-agnostic |

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
- **The facade:** `ctx.service<PlanningHostService>(PLANNING_SERVICE).for({ entityId, profileId?,
  channel?, actor? })` → a `PlanningFacade` with no scope argument on any method. That form works
  however the service was registered. `ctx.planning()` is only a shortcut that `appendPlanningService`
  / `appendPostgresPlanning` install (typed `WithPlanningService`); a context that registered
  `makePlanningService()` / `makePostgresPlanningService()` as a plain service — a generated target's
  `services/planning.ts` — has no `ctx.planning` at all. In a request handler use
  `planningHandlerOf(ctx).planningFor(req)`: the entity comes from `makeEntityScope(req).requireEntityKey()`, never the token.

## Creating and reading a card

```ts
import { IntrinsicStatus, PLANNING_SERVICE, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import type { PlanningHostService } from '@owlmeans/server-planning'

const planning = ctx.service<PlanningHostService>(PLANNING_SERVICE).for({ entityId, profileId })

const shed = await planning.execute({
  action: TransitionAction.Create,
  card: { kind: WorkcardKind.Project, type: 'shed:shed', title: 'Maple Street shed' },
}, { wait: true })
const drill = await planning.execute({
  action: TransitionAction.Create,
  card: { kind: WorkcardKind.Card, type: 'shed:tool', parent: shed.card!.id!, title: 'Cordless drill',
    fields: { brand: 'Acme' } },
}, { wait: true })                      // drill.card — the committed record, status 'available'

await planning.cards.get(drill.card!.id!)
await planning.cards.list({ parent: shed.card!.id!, type: 'shed:tool' })
await planning.execute({ action: TransitionAction.Transit, card: drill.card!.id!, transition: 'lend' }, { wait: true })

// A card type and a flow as DATA, scoped to this shed — `definitions` exists only where the store
// keeps schemas (planning-postgres; the memory store with `schemas: true`), and the shed's cards may
// use them when its project type says `scopedCardTypes: true` (or lists the type in `cardTypes`).
await planning.definitions!.define({
  flows: [{
    id: 'shed:repair', version: 1, label: 'Repair',
    statuses: [
      { key: 'reported', intrinsic: IntrinsicStatus.Planned, initial: true, label: 'Reported' },
      { key: 'fixed', intrinsic: IntrinsicStatus.Closed, terminal: true, label: 'Fixed' },
    ],
    transitions: [{ name: 'fix', from: ['reported'], to: 'fixed', label: 'Mark fixed', explicit: true }],
  }],
  types: [{
    type: 'shed:repair', kind: WorkcardKind.Card, version: 1, label: 'Repair ticket',
    fields: { type: 'object', properties: { tool: { type: 'string' } }, additionalProperties: false },
    flows: ['shed:repair'], specifications: [],
  }],
}, { project: shed.card!.id! })
```

| Wrong | What happens | Right |
|---|---|---|
| `execute({ action, draft: { … } })` | refused: `planning:malformed:create-without-draft` | the draft goes under `card` |
| `execute({ …, wait: true })` | in process the key is ignored: the receipt returns before the commit, with no `card` — hidden while an inline-folding store (`planning-postgres`) lands at once, exposed the first time another process holds the card's fold | `execute({ … }, { wait: true })` — only the wire body (`ExecuteRequest`) carries `wait` inside |
| `ctx.planning().for(…)` in a target | `ctx.planning is not a function` | `ctx.service<PlanningHostService>(PLANNING_SERVICE).for(…)` |
| `{ id, name: 'Repair', … }` on a flow, `{ key, name, … }` on a type | `define` refuses with `SchemaInvalid` (closed schemas); a code plugin's registry does not validate, so the key is silently dropped | a flow's key is `id`, a type's is `type`, the display name is `label` on both |
| `action: 'create'` | a type error — `TransitionAction` is an enum | `action: TransitionAction.Create` |

Every wrong form is a compile error against the typed facade (`PlanningFacade`,
`TransitionExecution`, `WorkcardTypeSchema`); it reaches run time only through a helper or a context
typed `any`, so never type one that way. `tests/create-example.spec.ts` runs this example and each
wrong form as written.

## The executor, step by step

Nothing is appended before step 11 — every refusal leaves the log untouched.

1. **Normalize** — deep copy, trimmed text, `parents ∋ parent` (first); a create's draft without
   `createdBy` gets `creatorHelper.creatorOf(scope)` (below).
2. **Scope** — `entityId` must be present.
3. **Idempotency** — a `key` already in the entity's log answers ITS receipt, before any
   validation or middleware.
4. **Resolve** — the card (`WorkcardNotFound`; another entity's card is `PlanningScopeMismatch`;
   one outside the scope's `projects` is `WorkcardNotFound`), its type and flow, every draft parent
   (`ParentNotFound` — loaded through the facade, so an invisible parent is absent) and the parent
   project's `cardTypes`/`projectTypes` (`CardTypeNotAllowed`), the specification slot. Where the
   default store holds data-defined schemas, the card's project is found first and everything
   after reads that project's resolved layer (`Resolved.schemas`): a data-defined type of a
   project with `scopedCardTypes` is admitted, a retired type creates nothing
   (`UnknownWorkcardType('retired:…')`). Without the port `Resolved.schemas` IS the code registry.
5. **`before` chain** — in plugin order; re-resolved once when it changed the card, type or parent.
6. **Validate** — shape (`planning:malformed:*`), the flow rule (`IllegalTransition`), immutables
   (`planning:immutable:*`, `createdBy` among them — `creatorHelper.assertCreatorFixed`), merged `fields` (`FieldsInvalid`), labels (`LabelNotAllowed`), a moved
   parent, the slot (`SpecificationSlotUnknown`, `SpecificationRevisionConflict`, JSON body schema
   → `FieldsInvalid`), relationships (`RelationshipRefused`: undeclared type, `from` not the card,
   missing target, type constraints, `single`, unlinking an absent edge).
7. **Card id** — `store.newId?.() ?? options.ids?.() ?? idHelper.uuid()`. Ids are the store's.
8. **Code** — a supplied code is checked; else the plugins' `mintCode` (first answer wins, checked);
   else the type's `CodePolicy` (a slug policy derives from the title) → `CodeTaken`.
9. **Changes** — `changesHelper.computeChanges`. An `update` that changes nothing answers the card's latest
   receipt and appends nothing.
10. **Seq** — `transitions.nextSeq(card, expectSeq)`, a CAS against `head` (`WorkcardConflict`).
11. **Append** — `commit: pending`. A lost race on the key answers the winner's receipt.
12. **Project** — `store.cards.project(card)`: a sync store folds now, a queued one enqueues.
13. **Receipt** — `{ transition, card? (once committed), committed(opts) }`.
14. **`wait: true`** — `committed()` before returning (`CommitTimeout`, `CommitFailed`).

`actor` is the SCOPE's: `profileId`/`userId`/`service`/`channel` come from the scope only; an
in-process caller may add `agent`/`runId` on the execution. A handler never passes a wire `actor`.

A create's `createdBy` is the scope's subject too — `creatorHelper.creatorOf(scope)`: `profileId`, else `userId`,
else the same two of `scope.actor`. The executor stamps it on every path, so an in-process facade
create and the HTTP `execute` produce the same owner. An in-process draft that names `createdBy`
keeps it (explicit wins — a manager creating on someone's behalf); a scope naming nobody (a service
or system scope) leaves it unset; the wire drops a draft's `createdBy` before the stamp.

`createdBy` never moves after the create (the rule is `planning` → The record model). The executor
enforces it itself with `creatorHelper.assertCreatorFixed` at step 6, after the `before` chain, so a wire body, an
in-process caller and a plugin are refused alike, whatever `@owlmeans/planning` build the host
resolves. The conformance suite checks a store folds a stored row naming it as the pure fold does.

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

## The commit feed

- **Poll** — `commit.get` answers the status; with `?wait=<s>` (clamped to `maxPoll`, default 55)
  it subscribes, re-polls, and holds until the commit settles or the time is up, answering `pending`
  then — never an error.
- **Notify** — `commit.events` pushes `planning-commit` frames (or `opts.event`) filtered by the
  authenticated entity and optional `project`/`card` query values; a frame without `record` gets the
  card as it reads now. The subscription is released on the socket's `close` frame.
- `execute` with `wait: true` holds at most `maxPoll` seconds whatever `timeout` the body asked for.

## Scope and security

- Without `opts.access`: `entityId` is `makeEntityScope(req).requireEntityKey()`; `opts.scope(req, ctx)` adds a
  `channel` or `service` and can never replace the entity. `actor` and a create's `createdBy` come
  from the request, never the body (`executionHelper.wireExecution` drops a draft's claim, `creatorHelper.withCreator` stamps the
  subject, `creatorHelper.assertCreatorFixed` refuses a body naming `createdBy` — an update never re-owns a card).
- The organization of a scope is the one the request ACTS IN. `makeEntityScope(req).requireEntityKey()` answers
  `req.entity.id`, the stable record id (the token's `entitySlug` only where no entity resolver is
  registered). Behind an OIDC relying party (`@owlmeans/server-oidc-rp`) the acting organization is
  session state: the guard attaches `req.entity` with `id` = the organization claim's frozen
  `entityKey`, so the tenant key survives a rename and follows a switch. Take it in the handler and
  pass it down; never read it from the context or from a body.
- Another entity's card, specification or transition answers `WorkcardNotFound` — the same as an
  absent id — on reads and writes alike (`guardHelper.concealed`).
- Queries arrive in their wire form and are decoded with `wireHelper.decode*Query` before `queryHelper.criteriaOf`, which
  always adds the scope's `entityId`.

### The access resolver

`opts.access: (req, ctx) => Promise<{ entityId, projects?, writes?, grants? }>` is the hosting app's
decision per request; a throw is the request's answer (an `AuthForbidden` answers 403).

- `entityId` is the resolver's — never the token's, never `opts.scope`'s.
- `projects` becomes `PlanningScope.projects`, which the server facade enforces on every read and
  write. Visible are the projects, every card whose `parents` name one, and every specification
  whose parent card is visible (its `parents` hold only that card). Anything else reads as absent
  (`WorkcardNotFound`, `null`, an empty list); a create under an invisible parent is
  `ParentNotFound`; links and transitions are filtered by `project` (and post-filtered, for a store
  that ignores the field); commit subscriptions drop events outside the set and a status or wait
  refuses them.
- **A narrowed list or count sees a specification whenever its parent card is visible** — exactly
  what a single read admits. It is AND'd with `projectCriteriaOf(projects, through)`; when its
  criteria ask for specifications (`wantsSpecifications`) the facade resolves `through` (the visible
  parent cards) with ONE read per call: the query's `parent`, else the projects' own cards. A
  summary counts no specification and pays nothing extra. `tests/narrowing.spec.ts` pins it.
- A person who may see only SOME projects of their organization (a tool-shed volunteer given one
  shed) is expressed here: the resolver answers the project ids the person's grants list as
  `projects`, and omits the key when a grant covers every project — never a hand-written filter in
  each handler.
- `writes` is the subset of projects the person may WRITE in (`projects` are the ones they VIEW).
  `execute` on a card, specification or link needs it to be writable — the rule a narrowed read
  admits, over `writes`: the project itself, a card whose `parents` name one, a specification
  through its parent card; a create needs every named parent writable, and a create at the root
  (no parent, not a project) is refused. `schema.define` of a project layer needs the project in
  `writes`. A refusal is `PlanningForbidden` (403, `forbidden:writes:<id>`), checked before the grants
  and before the executor. NOT governed by it: a project create (`grants.createProjects` alone) and
  the organization layer (`grants.defineSchemas`). A card the scope cannot see is still answered
  as absent by the executor. Omitted — every visible project is writable.
  `tests/writes.spec.ts` pins viewer, writer and omitted.
- `grants` gates the stock handlers' writes: `createProjects` (a project create — `true` for the
  root, a list names the parent projects), `deleteProjects` (the delete of a project card — a list
  names the projects), `defineSchemas` (`schema.define` — `true` for the organization's layer, a
  list names project layers). A `grants` object refuses every flag it leaves out with
  `PlanningForbidden` (403); no `grants` gates nothing. In-process facade writes are not gated.

## Mounting in a target

The api half of the target mount (the common tree and the kit literals: `planning` → Mounting in a
target).

- Bind `servePlanningEntrypoints(tree, { access })` WITHOUT the commit socket —
  `.filter(entrypoint => entrypoint.protocol !== tree.commit.events)`: nothing authenticates a
  target's socket after it opens, so the client long-polls (`commit.get` with `wait`, `execute`
  with `wait: true`). Never write card, transition or schema routes beside it.
- The resolver maps container permissions onto the access: `projects` = the containers the person
  may view, `writes` = those they may modify, `grants` = `createProjects` / `deleteProjects` /
  `defineSchemas` from their create and admin rights. A creator sees what they created — stamp
  ownership in a `before` hook and add the card to both lists.

## Data-defined types and flows

Where the default store has the schema port, `runtime.schemasFor(entityId, project?)` answers the
resolved layer (`scopedSchemaHelper.resolveScopedBundle` over the code bundle and the organization's and project's
records), cached per (organization, project) and keyed by the store's `revision()` and the plugin
registry's version — a write anywhere moves the revision the next lookup reads, so a cached layer is
never stale; a store's `watch` evicts early. Without the port it answers the code registry itself.
`makeDefinitions` gives the facade `definitions`: every write checks the project (a project card the
scope can see), the seal, the closed-form checks (a type's flows resolve in its layer, counting flows
written beside it), then the store's compare-and-set. `retire` of a flow refuses with `SchemaInUse`
while a live type of the layer — or of any project layer, for an organization record — still runs
it. `facade.model(card)` builds over the layer of the card's own project, and `schema.list` answers
the scoped bundle (`?project=`) where `definitions` exists, the code bundle otherwise.

## Testing

Category A. Build one real context with `makeBasicContext` + `appendPlanningService({ store:
makeMemoryPlanningStore({ now }), plugins: [fixtures] })`, and run a handler through
`handler.bind({ ref: { ctx } })(req, res)` with a request carrying `auth` and `entity`. A monotonic
`now` keeps log order deterministic; `sync: false` + `flush()` pins pending and hook-count cases.
`tests/conformance.spec.ts` runs the conformance suite against the memory store with and without
`schemas: true`; a durable store's own tests run the same cases against a real database.

## Related

- `planning` — records, flows, the fold, the query language, the protocol tree, the models
- `client-planning` — the remote facade and the state mirror that talk to these handlers
- `planning-postgres` — the durable Postgres store built from these pieces
- `server-job`, `queue` — the declare/serve/feed pattern and the projection queue
- `resource` — the criteria engine every memory read goes through
