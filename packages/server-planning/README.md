# @owlmeans/server-planning

The server half of `@owlmeans/planning`: the planning service and its plugin registry, the
transition executor every write goes through, the in-memory reference store, the commit hub and the
protocol handlers, versioned auxiliary resource commands and schema-governed hierarchy. A backend appends the service once, binds the handlers to the shared protocol
tree, and reads and writes through a scoped facade. A browser or Node client uses
`@owlmeans/client-planning` against the same tree; a durable store implements the ports and reuses
the `@owlmeans/server-planning/store` subpath.

## Installation

```sh
bun add @owlmeans/server-planning@^0.1.18-rc.30 @owlmeans/planning@^0.1.18-rc.26 ajv
```

## Concepts

- **Facade** — `ctx.service<PlanningHostService>(PLANNING_SERVICE).for(scope)`: every read and
  write of one organization entity, with no scope argument on any method. `context.planning()` is
  the same service, but only on a context that went through `appendPlanningService`; a service
  registered as a plain one (`makePlanningService()`, a generated target's `services/planning.ts`)
  has no `context.planning`.
- **Executor** — the only write path: normalize → idempotency → resolve → plugins' `before` →
  validate → id → code → changes → seq CAS → append → project → receipt. Nothing is appended by a
  refusal.
- **Plugin** — contributes types and flows, may own types with its own store, mint codes, refuse or
  rewrite executions (`before`) and react to commits (`after`).
- **Commit** — a transition becomes visible when a store folds it; the folding process runs the
  `after` chain exactly once and publishes a commit event.
- **Store** — `makeMemoryPlanningStore()` for tests and single-process tools; a durable store in
  anything with more than one process.
- **Resource facade** — `assignees`, `teams`, `comments` and `mentions` use native versioned ports.
  Organization units serialize dependent writes, schema changes and derived relationships.

## Usage

Declare the tree once in the shared package:

```ts
import { makePlanningProtocols } from '@owlmeans/planning'

export const planningProtocols = makePlanningProtocols({
  base: { alias: 'app:planning', path: '/planning' },
  guards: DEFAULT_GUARD,
  resources: true,
  definitions: true,
})
```

Wire the service and bind the handlers:

```ts
import { appendPlanningService, servePlanningEntrypoints } from '@owlmeans/server-planning'

appendPlanningService(context, { plugins: [appTypesPlugin] })
context.registerEntrypoints(servePlanningEntrypoints(planningProtocols, {
  scope: req => ({ channel: 'web' }),
}))
```

Write through the facade and wait for the commit:

```ts
import { TransitionAction, WorkcardKind } from '@owlmeans/planning'

const planning = context.planning().for({ entityId, profileId, channel: 'agent' })
const { card } = await planning.execute({
  card: { kind: WorkcardKind.Card, type: 'app:task', parent: projectId, title: 'Ship it' },
  action: TransitionAction.Create,
  key: `import:${sourceId}`,
}, { wait: true })

await planning.execute({ card: card!.id!, action: TransitionAction.Transit, transition: 'start' }, { wait: true })
```

A plugin with a rule and a reaction:

```ts
import { ensurePlanningService } from '@owlmeans/server-planning'

ensurePlanningService(context).use({
  name: 'app-rules',
  order: 10,
  before: async (exec, { card, facade }) => {
    if (exec.transition === 'start' && await facade.cards.count({ parent: card?.parent, status: 'doing' }) > 0) {
      throw new ProjectBusy(card!.parent!)
    }
  },
  after: async (event, { transition }) => {
    if (event.action === TransitionAction.Transit && transition?.actor.channel === 'web') {
      await notifyWorker(event.card)
    }
  },
})
```

Hand-written handler and the memory store in a test:

```ts
import { appendPlanningService, planningHandlerOf } from '@owlmeans/server-planning'
import { makeMemoryPlanningStore } from '@owlmeans/server-planning/store'

appendPlanningService(testContext, { store: makeMemoryPlanningStore({ sync: false }), plugins: [fixtures] })
const cards = await planningHandlerOf(ctx).planningFor(req, { channel: 'web' }).cards.list({ parent: projectId })
```

## Native planning resources

Register assignee type schemas through `schemas.assigneeTypes` or the facade's definitions.
The scoped facade exposes versioned `assignees.create/update/retire`, `teams.create/update/remove`,
`comments.create/update/remove` and derived `mentions` reads/rebuilds. Resource updates and
removals require `{ version: record.version }`; they do not allocate card transitions.

Supply a verified `assigneeId` in the trusted scope for comment authors. Hosts may also supply
`defaultAssigneeId`; `@owlmeans/planning-auth` resolves verified authentication subjects and groups
to planning ids and can attribute missing card reporters. Never accept author or organization
claims from an untrusted resource request. Human authentication requirements come from assignee
type schemas, while nicknames identify participants only within an organization entity.

Use `teams.addMember/removeMember`, `teams.attach/detach`, `teams.members`, `teams.projects` and
`teams.assignees`. They reuse the relationship store and preserve reusable organization teams.
Schema reference fields maintain their canonical edges and named inverse views in the same
organization unit. Explicit relationship writes cannot contradict a field-authoritative edge.

`parent`, `parents` and derived `parentType` are the hierarchy. Schema parent/child rules validate
creates and reparenting; recursive project scope is checked before paging, including comments,
history, specifications and relationships. Project `mode` is access-policy metadata, separate
from status. Deleting a card removes its comments and mention cache. Project purge follows
current ancestry and retains unrelated organization assignees, reusable teams and reparented
survivors, even when an older log or edge caches the deleted project id.

Mount `resources: true` and `definitions: true` in the shared protocol tree, then bind stock
`servePlanningEntrypoints`. Its access resolver authorizes resource commands and conceals records
outside scope. Stock replies remove native `entityId` metadata from known record/envelope
positions, while application fields, schema definitions and transition changes remain opaque.

## API

- Service: `appendPlanningService`, `ensurePlanningService`, `makePlanningService`,
  `planningServiceApi`, `makePluginRegistry`, `makeStoreFacade`, `executeTransition`,
  `creatorHelper` (`creatorOf`, `withCreator`, `assertCreatorFixed`), `PlanningServiceOptions`, `PlanningHostService`,
  `PlanningRuntime`, `PluginRegistry`
- Handlers (one per file under `actions/`): `servePlanningEntrypoints`, `listSchemas`, `listCards`,
  `summarizeCards`, `getCard`, `listCardTransitions`, `listCardSpecifications`, `getSpecification`,
  `listSpecificationRevisions`, `listLinks`, `getTransition`, `executePlanning`, `getCommit`,
  `watchCommits`, `defineSchemas`, `applySchemaRequest`; `executionHelper` (`wireExecution`,
  `executeOptionsOf`, `assertExecutionWrites`, `assertExecutionGranted`); `PlanningHandlerOptions`,
  `PlanningScopeExtractor`, `PlanningAccessResolver`, `PlanningAccess`, `PlanningAccessGrants`,
  `PlanningGrant`
- Scope: `planningHandlerOf(ctx)` (`planningServiceOf`, `handlerScopeOf`, `handlerFacade`,
  `planningFor`), `makeRequestScope(req)` (`scopeOf`, `accessScopeOf`, `actorOf`),
  `makePlanningAccessModel(access)` (`assertGranted`, `writableIn`, `assertWrites`), `guardHelper`
  (`concealed`, `assertScope`, `notFoundOf`, `clampSeconds`), `projectCriteriaOf`
- Data-defined schemas: `makeDefinitions`, `makeSchemaViews`, `SchemaViews`, `SchemaViewsOptions`
- Projection: `makeProjectionProcessor`, `makePlanningQueueHooks`, `ProjectionOptions`
- Constants: `DEFAULT_ALIAS`, `MEMORY_STORE_ALIAS`, `DEFAULT_COMMIT_MEMORY`, `COMMIT_POLL_LADDER`,
  `DEFAULT_SCHEMA_VIEWS`
- `@owlmeans/server-planning/store`: `makeMemoryPlanningStore`, `foldHelper` (`foldPending`,
  `failPending`, `revisionsFromLog`, `commitEventOf`), `makeCommitHub`, `makeCompositeStore`,
  `wantsSpecifications`,
  and the types `BindablePlanningStore`, `CommitListener`, `CommitHub`, `CommitHubOptions`,
  `FoldOptions`, `FoldResult`, `MemoryPlanningStore`, `MemoryPlanningStoreOptions`, `StoreRoute`
- `@owlmeans/server-planning/conformance`: `planningConformance`, `conformanceCasesFor`,
  `planningConformancePlugin`, `conformanceClock`, `ConformanceFailure`, `assertHelper` (`check`,
  `same`, `sameSet`, `rejects`), the library fixtures (`LIBRARY`, `conformanceFixturesOf(facade)` —
  `createBranch`, `createBook`, `transit`)
  and the types `ConformanceCase`, `ConformanceSubject`, `ConformanceCapability`
- The former plain functions (`planningFor`, `foldPending`, `creatorOf`, `scopeOf`, `concealed`,
  `planningQueueHooks`, `check`, `createBranch`, …) remain as deprecated delegates.

## Common pitfalls

- A create's draft goes under `card` — `draft` is refused as `planning:malformed:create-without-draft`.
- `{ wait: true }` is the SECOND argument of `execute`; inside the execution it is ignored and the
  receipt returns before the commit.
- A type or flow declaration has no `name` or `key`: the display name is `label`, the key is `type`
  (a type) or `id` (a flow). `definitions.define` refuses anything else with `SchemaInvalid`; a code
  plugin's registry does not check, so keep the literals typed.

- `after` hooks run where the transition is FOLDED, once per commit — register the same plugins in
  every folding process, and never run hooks from a commit-bus subscription.
- Organization locks are released before `after` hooks, so a hook may write into the same scope.
- The memory store is per-process heap: wrong for multiple processes or restarts.
- `actor` comes from the scope; a wire `actor` or `createdBy` is ignored.
- A create's `createdBy` defaults to the scope's subject (`profileId`, else `userId`, else the
  scope actor's) on every path — in-process facade and HTTP alike; an in-process draft that names
  one keeps it, a scope naming nobody leaves it unset.
- After the create `createdBy` never moves: an execution naming it in `changes` or `unset` is
  refused with `planning:immutable:createdBy` — over HTTP, in process and from a `before` plugin.
- Another entity's record is `WorkcardNotFound`, never a permission error.
- Give retried writes a `key` — it is checked before validation, so a retry answers the first receipt.
- `expectSeq` compares against `head`; a stale one is `WorkcardConflict`, re-read and retry.
- Call `appendPlanningService` before any `ensurePlanningService`, or the appended host replaces
  what was registered on the default one.
- `opts.access` makes the resolver the only source of the organization; a `grants` object refuses
  every flag it leaves out.
- A durable store is not done until it passes `@owlmeans/server-planning/conformance`.
- Resource writes require their current `version`; assignee/team `fields` replace the previous
  object, while card `changes.fields` merge. A field-backed relationship is changed through its
  field, not by writing an independent link.

## Related packages

- `@owlmeans/planning` — records, flows, fold, query language, protocol tree, models
- `@owlmeans/client-planning` — the remote facade and state mirror
- `@owlmeans/planning-postgres` — the durable Postgres store
- `@owlmeans/server-job`, `@owlmeans/queue` — job feeds and the projection queue

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.53
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
