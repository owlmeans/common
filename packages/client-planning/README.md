# @owlmeans/client-planning

The client half of OwlMeans planning: a `PlanningFacade` over the protocol tree a server mounted
with [`@owlmeans/server-planning`](../server-planning), an optional state mirror of cards, links and
commits, and a commit wait that subscribes first and then long-polls. It is React-free, so the same
code runs in a browser app and in a Node client. Use `@owlmeans/server-planning` instead wherever the
planning service runs in-process.

## Installation

```bash
bun add @owlmeans/client-planning@^0.1.18-rc.2
```

## Concepts

- **Remote facade** — the same `PlanningFacade` interface the server answers; every method is one
  entrypoint call, and `modelOf(record, facade)` models behave identically on both sides.
- **One id space** — projects, cards and specifications share ONE card store; a list reaches it
  through `syncCards(store, items, where)`, never `replace()`.
- **Commit** — `execute()` returns a receipt for a pending transition; `receipt.committed()` /
  `commits.wait()` resolve with the folded card, or throw `CommitTimeout` / `CommitFailed`.
- **Socket seam** — the commit socket is opened by an injected `PlanningSocketOpener`; without one
  the client long-polls.
- **`head > seq`** — a card with a transition allocated and not yet folded; `applyReceipt` marks it
  the moment the server answers.

## Usage

Wire the client into a context with the server's own tree:

```typescript
import { makePlanningProtocols } from '@owlmeans/planning'
import { appendPlanningClient, appendPlanningStores } from '@owlmeans/client-planning'

const planningProtocols = makePlanningProtocols({
  base: { alias: 'app:api:planning', path: '/planning', service: API },
  guards: DEFAULT_GUARD,
})

appendPlanningClient(context, { protocols: planningProtocols, poll: 20 })
appendPlanningStores(context)
```

Read through the facade — rich queries, encoded for the wire by the package:

```typescript
const planning = context.planning().for()
const { items } = await planning.cards.list({ parent: projectId, type: 'app:story', sort: ['order'], size: 0 })
const counts = await planning.cards.summary([projectId])
```

Transit a card and wait for the commit:

```typescript
const story = await planning.model(items[0])
if (story.can('start')) {
  const card = await (await story.transit('start')).committed({ timeout: 15_000 })
}
```

Keep a mirror current with one feed per screen:

```typescript
import { makePlanningFeed } from '@owlmeans/client-planning'

const feed = makePlanningFeed(context, {
  query: { parent: projectId }, filter: { project: projectId }, refresh: 15_000,
})
await feed.ready
// … read context.planningStores().cards with useStoreList from @owlmeans/client
await feed.stop()
```

Give a browser its commit socket through the host's own opener:

```typescript
appendPlanningClient(context, {
  protocols: planningProtocols,
  socket: async (protocol, request) => await ws(context.entrypoint(protocol), request),
})
```

## API

- `appendPlanningClient(context, options)`, `makePlanningClientService(context, options)`
- `makeRemoteFacade(context, protocols, scope, opts)`, `makeRemoteCommitSource(context, protocols, opts?)`
- `appendPlanningStores(context, aliases?)`, `planningStoresOf(context)`, `syncCards`, `syncLinks`
- `applyCommitEvent(stores, event, facade?)`, `applyReceipt(stores, view)`, `applyCards(stores, cards)`
- `makePlanningFeed(context, opts?)`
- `planningOf(context, scope?)`, `planningModelOf(context, card, scope?)`
- `CARDS`, `LINKS`, `COMMITS`, `DEFAULT_STORE_ALIASES`, `LONG_POLL_GRACE`, `EARLY_POLL_LADDER`, `EARLY_POLL_MS`
- Types: `PlanningClientOptions`, `PlanningClientService`, `WithPlanningClient`,
  `PlanningSocketOpener`, `RemoteCommitSource`, `RemoteCommitSourceOptions`, `RemoteFacadeOptions`,
  `PlanningStores`, `PlanningStoreAliases`, `WithPlanningStores`, `PlanningCommitRecord`,
  `SyncOptions`, `PlanningFeed`, `PlanningFeedOptions`, `PlanningFeedState`, `Config`, `Context`

## Common pitfalls

- The tree must match the server's alias for alias; a `socketBase` is the host's to bind.
- Never `replace()` the card store — it holds every kind.
- The scope passed to `for()` is advisory; the server takes the entity and actor from the credential.
- `CommitTimeout` leaves the transition pending — re-wait or re-read, do not re-execute without a `key`.
- A client refuses `store()`, `committed()` and plugins carrying hooks with `PlanningUnsupported`.
- Mount one feed per screen; every other reader uses the store.

## Related packages

- [`@owlmeans/planning`](../planning) — records, flows, the fold, models, the protocol tree
- [`@owlmeans/server-planning`](../server-planning) — the handlers, the executor, the memory store
- [`@owlmeans/state`](../state) — the store the mirror is built on
- [`@owlmeans/client`](../client) — `useStoreModel` / `useStoreList` over the mirror

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.30
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
