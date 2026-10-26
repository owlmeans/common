---
name: server-planning
description: How to use @owlmeans/server-planning — appendPlanningService and the plugin registry, the transition executor and its refusal order, the in-memory store, servePlanningEntrypoints and the commit socket, and the ports a durable or foreign provider implements. Auto-invoked when wiring planning into a backend, writing a planning plugin, or diagnosing a transition that was refused or never committed.
user-invocable: false
---

# @owlmeans/server-planning

**Layer:** Server
**Install:** `"@owlmeans/server-planning": "^0.1.18-rc.36"` in `dependencies` (`ajv` is a peer)

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
| `PlanningServiceOptions` | `{ store?, plugins?, schemas?, hooks?, ids?, now? }` — `schemas.app` is the first source the plugins' `schemas.app` merge over |
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
| `{ …, description: '…' }` on a type or a flow | `SchemaInvalid` (closed schemas) | `app: { description }`, with `schemas.app.type` / `.flow` declaring `description` (`planning` → types part) |
| `action: 'create'` | a type error — `TransitionAction` is an enum | `action: TransitionAction.Create` |

Every wrong form is a compile error against the typed facade (`PlanningFacade`,
`TransitionExecution`, `WorkcardTypeSchema`); it reaches run time only through a helper or a context
typed `any`, so never type one that way. `tests/create-example.spec.ts` runs this example and each
wrong form as written.

## Idempotency and `expectSeq`

- Give every retried or replayed write a `key` (`import:<source>:<n>`). The key is unique per entity
  and checked first, so a retry never re-validates against a card its first attempt already moved.
- `expectSeq` compares against `head`, not `seq`: two writers racing while a fold is pending both
  see the same `seq` but only one wins the head. `null` or omitted opts out; a model fills it from
  its record.

## Related

- `planning` — records, flows, the fold, the query language, the protocol tree, the models
- `client-planning` — the remote facade and the state mirror that talk to these handlers
- `planning-postgres` — the durable Postgres store built from these pieces
- `server-job`, `queue` — the declare/serve/feed pattern and the projection queue
- `resource` — the criteria engine every memory read goes through

## Parts

| Part | Load it when |
|---|---|
| [executor](parts/executor.md) | writing a planning plugin, or diagnosing why a transition was refused or never committed |
| [stores](parts/stores.md) | choosing or writing a store, or testing planning code |
| [serving](parts/serving.md) | binding the planning handlers, writing an access resolver, or narrowing what a person sees or writes |
| [schemas](parts/schemas.md) | defining or retiring types and flows as data |
| [auxiliary](parts/auxiliary.md) | working with assignees, teams, comments or mentions, or with reparenting and purge |
