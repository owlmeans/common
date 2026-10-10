# @owlmeans/client-planning

The client half of OwlMeans planning: a `PlanningFacade` over the protocol tree a server mounted
with [`@owlmeans/server-planning`](../server-planning), optional state mirrors of cards, links,
commits, assignees, teams, comments and mentions, and a commit wait that subscribes first and then long-polls. It is React-free, so the same
code runs in a browser app and in a Node client. Use `@owlmeans/server-planning` instead wherever the
planning service runs in-process.

## Installation

```bash
bun add @owlmeans/client-planning@^0.1.18-rc.29
```

## Concepts

- **Remote facade** — the same `PlanningFacade` interface the server answers; every method is one
  entrypoint call, and `modelOf(record, facade)` models behave identically on both sides.
- **One id space** — projects, cards and specifications share ONE card store; a list reaches it
  through `syncHelper.syncCards(store, items, where)`, never `replace()`.
- **Commit** — `execute()` returns a receipt for a pending transition; `receipt.committed()` /
  `commits.wait()` resolve with the folded card, or throw `CommitTimeout` / `CommitFailed`.
- **Socket seam** — the commit socket is opened by an injected `PlanningSocketOpener`; without one
  the client long-polls.
- **`head > seq`** — a card with a transition allocated and not yet folded; the mirror's `applyReceipt` marks it
  the moment the server answers.

## Forms under a strict Content Security Policy

Use the exact resolved card or assignee type's field schema:

```typescript
import { makePlanningFieldValidator } from '@owlmeans/client-planning'

const form = makePlanningFieldValidator(resolvedType.fields)
const checked = form.validateFields(fields)
if (checked.valid) {
  // Submit this same fields object through the stock planning facade.
}
```

The runtime interpreter supports dynamic organization and project definitions without `eval` or
`new Function`. It preserves the schema and payload, nested objects, required fields, enum/const,
dates, references, compositions and AJV nullable semantics; string formats use native
`ajv-formats` full-mode predicates. Errors contain field `path`, `keyword`, `schemaPath` and a
bounded message without submitted values. The server's authoritative AJV validates every write.

The schema contract is Draft 7 plus `$defs` and `nullable`, with native AJV reference-sibling
semantics. References must resolve within the supplied schema. Malformed schemas, missing
references, same-instance reference cycles, other drafts/custom validation keywords, unknown or
numeric formats, format-limit extensions and `multipleOf` throw `SchemaInvalid` at preparation.
The interpreter's floating tolerance and native AJV's multiple semantics differ, so that keyword
is explicitly refused. JSON fields cannot contain dot/dollar keys or non-JSON values. Standard
annotations and `x-` metadata remain annotations. At most 64 validation errors are returned.

Surface preparation errors and keep save disabled. Do not remove constraints, choose another
schema or relax CSP. Registry `validator` / `assigneeValidator` compile with native AJV and need
code generation; browser forms under strict CSP use this API instead.

## Usage

Wire the client into a context with the server's own tree:

```typescript
import { makePlanningProtocols } from '@owlmeans/planning'
import { appendPlanningClient, appendPlanningStores } from '@owlmeans/client-planning'

const planningProtocols = makePlanningProtocols({
  base: { alias: 'app:api:planning', path: '/planning', service: API },
  guards: DEFAULT_GUARD,
  resources: true,
  definitions: true,
})

appendPlanningClient(context, {
  protocols: planningProtocols, poll: 20,
  scopeKey: () => `${currentEntitySlug}:${currentSessionId}`,
})
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
  socket: async (protocol, request) => await socketClientHelper.ws(context.entrypoint(protocol), request),
})
```

## Auxiliary resources and session lifecycle

The remote facade supports the same `assignees`, `teams`, `comments` and `mentions` methods as
the server, including compare-and-set writes, canonical team membership/project attachment,
effective project assignees and mention-cache rebuilding. `definitions` supports assignee types
when the server mounts writable schemas. Relationships include endpoint resource kinds and named
inverse views; models resolve schemas through their nearest primary project.

`appendPlanningStores` registers four auxiliary mirrors beside cards, links and commits. Reads
and writes through the facade update those mirrors without replacing newer versions. A resource
feed refreshes the requested subsets through the stock API:

```ts
import { makePlanningResourceFeed } from '@owlmeans/client-planning'

const resources = makePlanningResourceFeed(context, {
  assignees: { retired: false, size: 0 }, teams: { size: 0 },
  comments: { card: cardId, size: 0 }, mentions: { card: cardId, size: 0 },
  refresh: 5_000,
})
await resources.ready
// Read context.planningStores().assignees, teams, comments and mentions.
await resources.stop()
```

`scopeKey` identifies the current organization slug and authenticated session. A changed key
cancels old requests and feeds, drains local mutations and clears mirrors; capture a new facade
and feed for the new session. `await context.planning().close()` releases feeds, subscriptions,
commit waits and sockets, including carriers that open late. Stopped requests cannot repopulate
cleared mirrors, even when a transport ignores cancellation.

The server derives authorization scope from credentials. Wire records omit native organization
`entityId`; the client hydrates empty advisory metadata for the shared record shape. Never use
that placeholder to authorize a request, and never send an organization record id on the wire.

## API

- `appendPlanningClient(context, options)`, `makePlanningClientService(context, options)`
- `makeRemoteFacade(context, protocols, scope, opts)`, `makeRemoteCommitSource(context, protocols, opts?)`
- `appendPlanningStores(context, aliases?)`
- `syncHelper` — `.syncCards(store, items, where?, opts?)`, `.syncLinks(store, items, where?, opts?)`
- `planningMirrorOf(stores)` (`makePlanningMirror`) — `.applyCommitEvent(event, facade?)`,
  `.applyReceipt(view)`, `.applyCards(cards)`
- `makePlanningFeed(context, opts?)`
- `makePlanningResourceFeed(context, opts?)`, `PlanningResourceFeedOptions`
- `makePlanningFieldValidator(schema)`, `PlanningFieldValidator`, `PlanningFieldValidation`, `PlanningFieldError`
- `makePlanningClientLifecycle`, `PlanningClientLifecycle`; service `close()` and `scopeKey`
- `planningContextOf(context)` (`makePlanningContextHelper`) — `.facade(scope?)`, `.model(card, scope?)`,
  `.stores()`
- The former plain functions (`syncCards`, `applyCards`, `planningOf`, …) remain as deprecated
  delegates.
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
- Auxiliary updates/removals require `{ version: record.version }`. Their `fields` replace the
  previous object; card `changes.fields` merge.
- After a scope/session change, acquire new facades and feeds. Old ones are deliberately stale.

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
npx @owlmeans/agent-skills@^0.1.18-rc.53
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
