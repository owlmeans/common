---
name: client-planning
description: How to use @owlmeans/client-planning — appendPlanningClient for the remote planning facade, appendPlanningStores and planningMirrorOf for the state mirror, makePlanningFeed, commits.wait (subscribe then long-poll), and the models that are the same objects the server uses. Auto-invoked when reading planning data in a browser or a Node client, mounting the commit feed, or wiring optimistic transitions.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-planning

**Layer:** Client
**Install:** `"@owlmeans/client-planning": "^0.1.18-rc.30"` in `dependencies`

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
| `makeRemoteDefinitions(context, protocols, opts?)` | Data-defined types and flows over a tree declared with `definitions: true` |
| `appendPlanningStores(context, aliases?)` / `planningContextOf(context).stores()` | The state mirror, and a lookup that answers `null` without one |
| `syncHelper.syncCards(store, items, where?, opts?)` / `syncHelper.syncLinks(...)` | Make the mirror agree with a list WITHIN a scope |
| `planningMirrorOf(stores).applyCommitEvent(event, facade?)` / `.applyReceipt(view)` / `.applyCards(cards)` | The folds |
| `makePlanningFeed(context, opts?)` | Subscribe, seed, fold, refresh — `{ connected, seeded, error, ready, refresh, stop }` |
| `planningContextOf(context).facade(scope?)` / `.model(card, scope?)` | The facade / a model with the schemas loaded |
| `makePlanningFieldValidator(schema)` | CSP-safe validation of an exact served field schema; `{ validateFields }` |
| `CARDS`, `LINKS`, `COMMITS` | Store aliases (`planning-card-state`, `planning-link-state`, `planning-commit-state`) |
| Types | `PlanningClientOptions`, `PlanningClientService`, `WithPlanningClient`, `PlanningSocketOpener`, `RemoteCommitSource`, `RemoteDefinitions`, `RemoteDefinitionsOptions`, `PlanningStores`, `PlanningStoreAliases`, `WithPlanningStores`, `PlanningCommitRecord`, `PlanningFeed`, `PlanningFeedOptions`, `PlanningFeedState`, `SyncOptions`, `PlanningContextHelper`, `PlanningMirror`, `SyncHelper` |

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
  **advisory** — it changes nothing the server decides: the server takes the entity and the actor
  from the credential. The execution's own `actor` is never sent.
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

### Data-defined types and flows

A tree declared with `definitions: true` (the server's store holds data-defined schemas) gives the
service and every facade `definitions`: `registry(project?)` / `bundle(project?)` read
`schema.list?project=` and are cached per project; `putType`/`putFlow` (compare-and-set on the
declaration's `version`), `define`, `seed` and `retire` go through `schema.define` and drop the
whole cache — an organization-wide write reaches every project's layer — and make the next
`model()` reload the service's own bundle. `records` is the server's alone (`PlanningUnsupported`).
`model(card)` of a card resolves its type in its project's layer (a project's own id, a card's
nearest primary project ancestor); a specification's type is always code's. A tree without `definitions` has none of this.

## Browser field validation under CSP

Bind `makePlanningFieldValidator(type.fields)` to the exact definition returned by the resolved
organization or project bundle. Its `validateFields(fields)` returns `{ valid, errors }`; errors
carry decoded `path`, `keyword`, `schemaPath` and a bounded value-free `message`. Construct one JSON
fields object, validate it and send that same object. No coercion, defaults or property removal
occurs, and the schema is left unchanged. Preserve nested money objects and calendar date strings.
The native server validates every write again.

The validator interprets schemas with `@cfworker/json-schema`, with no `eval`, `new Function` or
network reference loading. Do not call `makeSchemaRegistry(...).validator()` or
`.assigneeValidator()` in a browser with strict `script-src`: those remain native AJV compilers.
Static AJV standalone compilation is suitable only when the schema cannot change after building;
organization and project definitions require the runtime interpreter.

The supported contract is Draft 7's object/array/scalar, required, enum/const, ranges, string
length/pattern, dependencies, boolean, composition and conditional keywords; `$defs`, local/nested
`$id` references and AJV's `nullable` are also supported. `$ref` sibling constraints are enforced as
by native planning AJV. String formats use the same `ajv-formats` full-mode predicates, including
real calendar dates and timezone-aware times. `nullable` adds null to the declared type while
leaving enum and const constraints intact. All references must resolve inside the supplied field
schema; productive recursive schemas are supported, same-instance reference cycles are refused.
Plain JSON values and field names without dot or dollar characters are required.

Preparation throws `SchemaInvalid` for malformed schemas, unresolved references, unsupported
drafts/keywords/formats, numeric formats, `formatMinimum`/`formatMaximum` extensions and
`multipleOf`. The latter is refused because the interpreter's epsilon and native AJV's quotient
semantics disagree for fractional and very large numbers. Standard annotation keywords and `x-`
annotations do not add validation. Never discard a refused constraint, invent a substitute schema,
enable `unsafe-eval` or proceed with a ready form after preparation fails. Show the error and retain
disabled save controls. Validation reports at most 64 errors, with paths bounded to 512 characters.

## Mounting in a target

The web half of the target mount (`planning` → Mounting in a target).

- `appendPlanningClient(context, { protocols, bind: false, schemas: false })` — the target binds
  its whole api tree itself, and a signed-out visitor may read nothing, so the bundle loads on
  first use — plus `appendPlanningStores(context)`. No `socket`: the target serves no commit socket,
  so `commits.wait` long-polls.
- Screens read the mirror with `useStoreList` / `useStoreModel` (`@owlmeans/client`), never a
  fetched array kept in component state; lists reach the store through `syncHelper.syncCards` or
  `makePlanningFeed` (with `refresh`), NEVER `replace()` — the one card store holds every kind.
- Every write is `facade.execute(...)` with a `key` (a retried click or a double submit answers
  the first receipt) and `{ wait: true }` where the screen shows the result.
- Never call a route with an empty id; a picker offers no archived parent (`intrinsic: closed`).

## Reading

```typescript
const planning = context.planning().for()

const tools = await planning.cards.list({ parent: shedId, type: 'shed:tool', sort: ['order'], size: 0 })
const board = await planning.cards.summary([shedId])
const rules = await planning.specifications.current(shedId, 'house-rules')
const drill = await planning.model(drillId)
drill.available().map(rule => rule.name)
```

- The facade takes the rich `WorkcardQuery`; it encodes the scalar wire shape itself
  (`wireHelper.encodeWorkcardQuery` and its twins). Never pass a wire shape to the facade.
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

That is also why a list reaches the store through **`syncHelper.syncCards(store, items, where)`,
never `replace()`**: every card given is written, every card matching `where` that the list does not
name is dropped, and everything outside `where` is left alone. An unchanged card is not rewritten, so a
periodic re-seed wakes no subscriber. `opts.keep` protects ids a commit wrote while the list was in
flight.

The fold rules, shared by `syncHelper.syncCards`, the mirror's `applyCards` and `applyCommitEvent`, and
`commits.wait`:

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
  query: { parent: shedId, type: 'shed:tool' },
  filter: { project: shedId },
  refresh: 15_000,
  onChange: state => setState(state),
})
await feed.ready          // never rejects — read feed.error
// …
await feed.stop()         // stops folding; the shared socket stays open
```

1. Subscribes to commits FIRST (the socket, when an opener exists).
2. Seeds: `cards.list` (unpaged unless the query pages) → `syncHelper.syncCards` over `where`
   (`queryHelper.criteriaOf(query)` by default). A PAGED seed only writes — a page cannot say what
   does not exist.
3. Folds every frame with `planningMirrorOf(stores).applyCommitEvent`, and re-seeds every `refresh`
   ms — the authoritative backstop to a socket that can drop frames.

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

`seq` is the last transition folded into a card, `head` the highest allocated. The mirror's
`applyReceipt` (run by `execute` whenever stores are registered) raises the stored card's `head` to
the new transition's `seq`, so `model.pending()` is true before any frame arrives; the commit's fold
brings `seq` up to it. The mirror only ever grows `head`, so a list fetched before the append does not
clear the marker. A model's `expectSeq` default and its `WorkcardConflict` are `planning` → Models.

## Gotchas

- Mount a feed once per screen; read the store everywhere else.
- A refusal crosses the hop as its class (`IllegalTransition`, `WorkcardConflict`,
  `FieldsInvalid`, a plugin's own class) — branch on `instanceof`, never on message text.
- `CommitTimeout` is not a failure of the transition; re-wait or re-read the card.

## Depends On

- `@owlmeans/planning` — the facade interface, the protocol tree, the wire encoders, `modelOf`
- `@owlmeans/client-entrypoint` — `bindAll`, the typed `call()`
- `@owlmeans/state` — the mirror; `@owlmeans/socket` — `Connection`

## Auxiliary mirrors and authenticated scope lifecycle

With `resources: true` in the shared protocol tree, every remote facade exposes the complete
assignee/team/comment/mention API, including versioned writes, team membership and project
attachment. `appendPlanningStores` registers separate stock typed mirrors for all four resources.
`makePlanningResourceFeed` seeds and polls selected resource queries; use it with the stock stores
and `useStoreList` / `useStoreModel`. Auxiliary writes update the mirror only after success.
Comments use trusted server authors; mentions are read-only derived cache commands.

Supply `PlanningClientOptions.scopeKey` from authenticated organization entity slug, profile/user
id, session id and authorization revision; return undefined when signed out. Before switching
organization or signing out, **await** `service.close()` before adopting the credential. It cancels
requests and commit waits, invalidates receipts (including already-settled receipts), stops every
registered feed, removes socket subscriptions, closes the carrier and rejects late socket openers.
A stale operation answers `client:scope-changed`; cancellation never rolls back an accepted server
write. A new subscription opens a fresh carrier after close.

Close drains admitted **local** mirror writes before clearing every stock store and schema cache.
New calls during an explicit close are refused, including hosts without `scopeKey`. Concurrent
closes share the boundary. If clearing fails, close rejects and fresh work stays blocked; retain
the old credential and retry close explicitly. An observed identity change also cancels old work
and queues clearing before the new identity's mirror writes. Reload schemas and create fresh feeds
after credential adoption. Feed query scope alone is insufficient for this lifecycle.

The service's `lifecycle` coordinates stock facades, receipts, feeds and schema writes. A custom
mirror integration captures an operation with `lifecycle.run`, performs remote reads through
`operation.wait` with `operation.signal`, then uses `lifecycle.mutate(operation, write)` for local
writes; never hold or nest that queue over a request, socket opener or another queued mutation.
`planningMirrorOf(stores)` accepts `{ lifecycle, operation }` as its optional last argument and
fetches missing frame records/links before entering the queue. Direct mirror/sync helpers without
that option are local primitives: their caller owns isolation and cleanup.

Planning protocols return `PlanningReply<T>` without storage organization identifiers. Stock
facades hydrate records, receipts, schema scopes and socket frames with `entityId: ''` only to
preserve the shared facade shape. That value is an advisory placeholder, never an organization
identity or a credential. Use `scopeKey` and the authenticated organization entity slug for
identity changes and access isolation; native server records keep their verified stable scope.

Resource feed reconciliation snapshots mirror versions before requesting a list. Only unchanged
snapshot rows absent from that response are removed, so a new local write or a newer version
survives an older in-flight poll. Stopped feeds cannot publish. Track custom feeds through
`registerFeed` when their lifecycle must end with the planning service. Card feeds use the same
identity fence and stop registration; component cleanup awaits `stop()` when it must observe a
completed boundary. Stop cancels unresolved seeds and drains admitted local changes without waiting
for the network; neither late callbacks nor authoritative deletion passes may publish afterward.
A schema write from an old generation cannot invalidate a newer generation's cached registry.


## Related

- `planning` — records, flows, the fold, the models
- `server-planning` — the handlers this addresses, the executor, the commit hub
- `client-job` — the same seed-then-fold shape for safe application-job views
- `state` — `syncHelper.syncCards` is built on its criteria engine and `purge`

## External docs

- https://ajv.js.org/security.html#content-security-policy — runtime AJV requires unsafe-eval; standalone build compilation preserves strict CSP for static schemas.
- https://www.npmjs.com/package/@cfworker/json-schema/v/4.1.1 — the interpreter supports dynamic schemas without code generation; select an explicit vocabulary and check its known limitations (4.1.1).
- https://github.com/ajv-validator/ajv-formats#full-and-fast-validation-modes — full-mode predicates validate formats completely and are reusable through the plugin's `get` API (3.0.1).
- https://ajv.js.org/json-schema.html#nullable-openapi — nullable expands the declared type without adding null to enum or const.
