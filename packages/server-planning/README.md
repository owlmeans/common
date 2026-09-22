# @owlmeans/server-planning

The server half of `@owlmeans/planning`: the planning service and its plugin registry, the
transition executor every write goes through, the in-memory reference store, the commit hub and the
protocol handlers. A backend appends the service once, binds the handlers to the shared protocol
tree, and reads and writes through a scoped facade. A browser or Node client uses
`@owlmeans/client-planning` against the same tree; a durable store implements the ports and reuses
the `@owlmeans/server-planning/store` subpath.

## Installation

```sh
bun add @owlmeans/server-planning@^0.1.18-rc.4 @owlmeans/planning@^0.1.18-rc.4 ajv
```

## Concepts

- **Facade** — `context.planning().for(scope)`: every read and write of one organization entity,
  with no scope argument on any method.
- **Executor** — the only write path: normalize → idempotency → resolve → plugins' `before` →
  validate → id → code → changes → seq CAS → append → project → receipt. Nothing is appended by a
  refusal.
- **Plugin** — contributes types and flows, may own types with its own store, mint codes, refuse or
  rewrite executions (`before`) and react to commits (`after`).
- **Commit** — a transition becomes visible when a store folds it; the folding process runs the
  `after` chain exactly once and publishes a commit event.
- **Store** — `makeMemoryPlanningStore()` for tests and single-process tools; a durable store in
  anything with more than one process.

## Usage

Declare the tree once in the shared package:

```ts
import { makePlanningProtocols } from '@owlmeans/planning'

export const planningProtocols = makePlanningProtocols({
  base: { alias: 'app:planning', path: '/planning' },
  guards: DEFAULT_GUARD,
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
import { appendPlanningService, planningFor } from '@owlmeans/server-planning'
import { makeMemoryPlanningStore } from '@owlmeans/server-planning/store'

appendPlanningService(testContext, { store: makeMemoryPlanningStore({ sync: false }), plugins: [fixtures] })
const cards = await planningFor(ctx, req, { channel: 'web' }).cards.list({ parent: projectId })
```

## API

- Service: `appendPlanningService`, `ensurePlanningService`, `makePlanningService`,
  `planningServiceApi`, `makePluginRegistry`, `makeStoreFacade`, `executeTransition`,
  `PlanningServiceOptions`, `PlanningHostService`, `PlanningRuntime`, `PluginRegistry`
- Handlers: `servePlanningEntrypoints`, `planningFor`, `listSchemas`, `listCards`,
  `summarizeCards`, `getCard`, `listCardTransitions`, `listCardSpecifications`, `getSpecification`,
  `listSpecificationRevisions`, `listLinks`, `getTransition`, `executePlanning`, `wireExecution`,
  `executeOptionsOf`, `getCommit`, `watchCommits`, `PlanningHandlerOptions`, `PlanningScopeExtractor`
- Scope: `scopeOf`, `actorOf`, `handlerFacade`, `planningServiceOf`, `concealed`, `assertScope`,
  `notFoundOf`, `clampSeconds`
- Projection: `makeProjectionProcessor`, `planningQueueHooks`, `ProjectionOptions`
- Constants: `DEFAULT_ALIAS`, `MEMORY_STORE_ALIAS`, `DEFAULT_COMMIT_MEMORY`, `COMMIT_POLL_LADDER`
- `@owlmeans/server-planning/store`: `makeMemoryPlanningStore`, `foldPending`, `failPending`,
  `revisionsFromLog`, `commitEventOf`, `makeCommitHub`, `makeCompositeStore`, and the types
  `BindablePlanningStore`, `CommitListener`, `CommitHub`, `CommitHubOptions`, `FoldOptions`,
  `FoldResult`, `MemoryPlanningStore`, `MemoryPlanningStoreOptions`, `StoreRoute`

## Common pitfalls

- `after` hooks run where the transition is FOLDED, once per commit — register the same plugins in
  every folding process, and never run hooks from a commit-bus subscription.
- The memory store is per-process heap: wrong for multiple processes or restarts.
- `actor` comes from the scope; a wire `actor` or `createdBy` is ignored.
- Another entity's record is `WorkcardNotFound`, never a permission error.
- Give retried writes a `key` — it is checked before validation, so a retry answers the first receipt.
- `expectSeq` compares against `head`; a stale one is `WorkcardConflict`, re-read and retry.
- Call `appendPlanningService` before any `ensurePlanningService`, or the appended host replaces
  what was registered on the default one.

## Related packages

- `@owlmeans/planning` — records, flows, fold, query language, protocol tree, models
- `@owlmeans/client-planning` — the remote facade and state mirror
- `@owlmeans/server-job`, `@owlmeans/queue` — job feeds and the projection queue

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.32
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
