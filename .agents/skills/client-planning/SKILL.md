---
name: client-planning
description: How to use @owlmeans/client-planning — appendPlanningClient for the remote planning facade, appendPlanningStores and applyCommitEvent for the state mirror, makePlanningFeed, commits.wait (subscribe then long-poll), and the models that are the same objects the server uses. Auto-invoked when reading planning data in a browser or a Node client, mounting the commit feed, or wiring optimistic transitions.
user-invocable: false
---

# @owlmeans/client-planning

**Layer:** Client
**Install:** `"@owlmeans/client-planning": "^0.1.18-rc.11"` in `dependencies`

The client half of OwlMeans planning. It answers the `PlanningFacade` interface of
`@owlmeans/planning` over the protocol tree a server mounted with `@owlmeans/server-planning`, keeps
an optional `@owlmeans/state` mirror of cards, links and commits current, and waits for commits.
It is **React-free**: the same package runs in a browser app and in a Node client (a connector, a
CLI). React hooks over the mirror are `useStoreModel` / `useStoreList` from `@owlmeans/client`.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendPlanningClient(context, options)` | Bind the tree, register the service under `PLANNING_SERVICE`, add `context.planning()` |
| `makePlanningClientService(context, options)` | The service itself, for a host that registers it on its own |
| `makeRemoteFacade(context, protocols, scope, opts)` | One facade — every method is one entrypoint call |
| `makeRemoteCommitSource(context, protocols, opts?)` | `status` / `subscribe` / `wait` over `commit.get` and `commit.events` |
| `appendPlanningStores(context, aliases?)` / `planningStoresOf(context)` | The state mirror, and a lookup that answers `null` without one |
| `syncCards(store, items, where?, opts?)` / `syncLinks(...)` | Make the mirror agree with a list WITHIN a scope |
| `applyCommitEvent(stores, event, facade?)` / `applyReceipt(stores, view)` / `applyCards(stores, cards)` | The folds |
| `makePlanningFeed(context, opts?)` | Subscribe, seed, fold, refresh — `{ connected, seeded, error, ready, refresh, stop }` |
| `planningOf(context, scope?)` / `planningModelOf(context, card, scope?)` | The facade / a model with the schemas loaded |
| `CARDS`, `LINKS`, `COMMITS` | Store aliases (`planning-card-state`, `planning-link-state`, `planning-commit-state`) |
| Types | `PlanningClientOptions`, `PlanningClientService`, `WithPlanningClient`, `PlanningSocketOpener`, `RemoteCommitSource`, `PlanningStores`, `PlanningStoreAliases`, `WithPlanningStores`, `PlanningCommitRecord`, `PlanningFeed`, `PlanningFeedOptions`, `PlanningFeedState`, `SyncOptions` |

## Wiring

```typescript
import { makePlanningProtocols } from '@owlmeans/planning'
import { appendPlanningClient, appendPlanningStores } from '@owlmeans/client-planning'

export const planningProtocols = makePlanningProtocols({
  base: { alias: 'app:api:planning', path: '/planning', service: API },
  guards: DEFAULT_GUARD,
  socketBase: updateBase,
})

appendPlanningClient(context, {
  protocols: planningProtocols,
  socket: async (protocol, request) => await ws(context.entrypoint(protocol), request),
  poll: 20,
})
appendPlanningStores(context)        // a browser mirror; a Node client usually skips it
```

- The tree is **the server's tree** — the same `makePlanningProtocols` options, alias for alias.
  Declare it once in the application's shared contract package and import it on both sides.
- When the commit feed hangs under a `socketBase`, the HOST binds that base too. A parent a
  registry cannot resolve fails the whole context at init, not the one call that uses it.
- `bind: false` when the host already bound the tree.
- The service answers under `PLANNING_SERVICE`, the alias the server's service uses, so
  `context.planning().for(scope)` is the same call in a handler and in a screen. The scope is
  **advisory**: the server takes the entity and the actor from the credential. The execution's own
  `actor` is never sent.
- A client runs no middleware and folds nothing: `store()`, `committed()` and a plugin carrying
  `before`/`after`/`store`/`mintCode` answer `PlanningUnsupported`. `use()` accepts a schemas-only
  plugin, layered over the server's bundle.
- `timeout` (ms) bounds every call that is not a long poll; a long poll's deadline is its own hold
  plus `LONG_POLL_GRACE`.

### The schema bundle

`model()` needs the flows and types (`can()`, `available()`, `statusOf()` read the registry with no
round trip). The bundle is fetched in the background once the context is **Ready** and a failure
there is swallowed — a browser that is not signed in yet cannot read it, and a context must never
fail or wait over it. `model()` and `service.loadSchemas()` load it on first use regardless, and a
failed load is retried by the next caller. `schemas: false` skips the background load.

## Reading

```typescript
const planning = context.planning().for()

const stories = await planning.cards.list({ parent: projectId, type: STORY, sort: ['order'], size: 0 })
const board = await planning.cards.summary([projectId])
const brief = await planning.specifications.current(projectId, 'specification')
const story = await planning.model(storyId)
story.available().map(rule => rule.name)
```

- The facade takes the rich `WorkcardQuery`; it encodes the scalar wire shape itself
  (`encodeWorkcardQuery` and its twins). Never pass a wire shape to the facade.
- `cards.load(id)` answers `null` for a missing card — and for another entity's card, which the
  server deliberately reports the same way.
- `cards.count(query)` is a one-row list read for its `total`; the tree declares no count route.
- `transitions.list(query)` needs `card` — the tree reads the log through one card, so a
  project-wide read answers `PlanningUnsupported` on a client.
- `size: 0` is "no limit"; a paged server answers 100 rows when no size is asked for.

## The mirror — one id space

`appendPlanningStores` registers ONE card store for every kind. Projects, cards and specifications
share an id space on the server, so they share one store here: a store per kind lets a card list
that reloads drop the projects beside it.

That is also why a list reaches the store through **`syncCards(store, items, where)`, never
`replace()`**: every card given is written, every card matching `where` that the list does not name
is dropped, and everything outside `where` is left alone. An unchanged card is not rewritten, so a
periodic re-seed wakes no subscriber. `opts.keep` protects ids a commit wrote while the list was in
flight.

The fold rules, shared by `syncCards`, `applyCards`, `applyCommitEvent` and `commits.wait`:

- an OLDER `seq` never overwrites a newer record — frames and list answers race;
- a committed `delete` removes the row and every link touching it; a project's delete also drops
  the rows whose `parents` hold it (the server purged them in the same fold);
- a frame for an id the store never saw still writes a row;
- a `failed` commit leaves the card alone and records the reason in the commit store;
- a frame without `record` (a cross-process bus carries ids only) is re-read through the facade —
  without one, only the commit row is written;
- a committed `link`/`unlink` re-lists the card's outgoing links; links written together with a
  `create` arrive with the next link seed.

## The feed

```typescript
const feed = makePlanningFeed(context, {
  query: { parent: projectId, type: STORY },
  filter: { project: projectId },
  refresh: 15_000,
  onChange: state => setState(state),
})
await feed.ready          // never rejects — read feed.error
// …
await feed.stop()         // stops folding; the shared socket stays open
```

1. Subscribes to commits FIRST (the socket, when an opener exists).
2. Seeds: `cards.list` (unpaged unless the query pages) → `syncCards` over `where`
   (`criteriaOf(query)` by default). A PAGED seed only writes — a page cannot say what does not
   exist.
3. Folds every frame with `applyCommitEvent`, and re-seeds every `refresh` ms — the authoritative
   backstop to a socket that can drop frames.

`connected` reports whether a socket was open when the feed subscribed; `seeded` tells "nothing
there" from "not loaded yet". A React hook wraps the feed in an effect and stops it on unmount.

## Waiting for a commit

`execute()` is asynchronous: the receipt names a PENDING transition until the store folds it.

```typescript
const receipt = await planning.execute({ card: id, action: TransitionAction.Transit, transition: 'start' })
const card = await receipt.committed({ timeout: 15_000 })     // or execute(exec, { wait: true, timeout })
```

`commits.wait(transition, { timeout })`:

1. **subscribes first** — a commit landing between a status read and a subscription is otherwise
   missed until the deadline;
2. reads the status once with `wait: 0`;
3. long-polls `commit.get` in holds of `min(poll, remaining)` seconds, racing any socket frame;
4. at the deadline throws `CommitTimeout` — the transition STAYS pending, nothing is undone.

A `failed` commit throws `CommitFailed` with the store's reason. A settled commit is folded into
the mirror when stores are registered. A poll the server answers without holding is followed by a
short pause ladder instead of a tight loop, and a dropped hold is replaced by one non-holding read.

`execute({ wait: true })` never holds the POST on the wire: the receipt returns at once and the
wait above runs from the client. A lost response therefore never leaves a caller unsure whether
the transition was appended — the key (`exec.key`) still makes a retry of the POST itself safe.

## The socket seam

`socket` is a `PlanningSocketOpener` — `(protocol, request?) => Promise<Connection | null>`. The
package never imports `@owlmeans/client-socket`, whose helpers pull React; a browser host wraps its
own `ws()` there (which also puts the session token on the connection). `null` means "no socket
right now" and the next subscription asks again. ONE connection serves every subscription of the
service; releasing a subscription never closes it — `context.planning().close()` does.

A Node client passes no opener and relies on the long poll.

## Optimistic writes and `head > seq`

`seq` is the last transition folded into a card, `head` the highest allocated. `applyReceipt`
(run by `execute` whenever stores are registered) raises the stored card's `head` to the new
transition's `seq`, so `model.pending()` is true before any frame arrives; the commit's fold brings
`seq` up to it. The mirror only ever grows `head`, so a list fetched before the append does not
clear the marker. A model's writes default `expectSeq` to `record.head ?? record.seq`; a stale model
gets `WorkcardConflict` — reload and retry.

## Gotchas

- Mount a feed once per screen; read the store everywhere else.
- Do not `replace()` the card store — it holds every kind. Use `syncCards` with a `where`.
- A refusal crosses the hop as its class (`IllegalTransition`, `WorkcardConflict`,
  `FieldsInvalid`, a plugin's own class) — branch on `instanceof`, never on message text.
- `CommitTimeout` is not a failure of the transition; re-wait or re-read the card.
- The scope passed to `for()` changes nothing the server decides; it exists so code written against
  `PlanningFacade` reads the same on both sides.

## Depends On

- `@owlmeans/planning` — the facade interface, the protocol tree, the wire encoders, `modelOf`
- `@owlmeans/client-entrypoint` — `bindAll`, the typed `call()`
- `@owlmeans/state` — the mirror; `@owlmeans/socket` — `Connection`

## Related

- `planning` — records, flows, the fold, the models
- `server-planning` — the handlers this addresses, the executor, the commit hub
- `client-job` — the same seed-then-fold shape for safe application-job views
- `state` — `syncCards` is built on its criteria engine and `purge`
