---
name: state
description: How to use @owlmeans/state — appendStateResource() to register a client state resource on a context, useStoreModel/useStoreList to read it from React, live query subscriptions, and the StateModel commit semantics. Auto-invoked when importing state primitives or building client-side application state.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/state

**Layer:** Core
**Install:** `"@owlmeans/state": "^0.1.18-rc.8"` in `dependencies`

The framework's client store. A state resource is a `Resource` like any other, registered **on the
context** — which is what separates it from a store held beside the app: a screen, a service and a
guard all reach the same records through the same container.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendStateResource<C, T>(context, alias?)` | Register a state resource on the context |
| `createStateResource<T>(alias?)` | The bare factory, when you register it yourself |
| `StateResource<T>` | The resource interface — full CRUD plus `all`, `match`, `subscribe`, `listen`, `erase` |
| `StateModel<T>` | The subscribed wrapper — `record`, `update`, `commit`, `clear` |
| `matchCriteria`, `filterRecords`, `sortRecords` | The criteria evaluator, for filtering a list you already hold |
| `DEFAULT_ID` (`_default`), `DEFAULT_ALIAS` (`state`) | Constants |

The React hooks live in **`@owlmeans/client`** — `useStoreModel`, `useStoreList`. They are not
re-exported by `@owlmeans/web-client`, so import them from `@owlmeans/client` directly.

## Registering

Every client context already carries one default state resource, so `useStoreModel(id)` works with
no setup at all. Register a named one per entity when records of different kinds must not share an
id space:

```typescript
import { appendStateResource } from '@owlmeans/state'

export const TASK_STATE = 'task-state'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)
  appendStateResource<C, T>(context, TASK_STATE)
  // A child context must inherit THIS factory, or it is built without the resource above.
  context.makeContext = makeContext as typeof context.makeContext
  return context
}
```

Reach it with `context.getStateResource<Task>(TASK_STATE)`. A typed accessor on the context
(`context.taskStore = () => context.getStateResource(TASK_STATE)`) is optional sugar.

## Reading it from React

```typescript
import { useStoreList, useStoreModel } from '@owlmeans/client'

// One record, by id. Re-renders whenever that record changes.
const task = useStoreModel<Task>(id, TASK_STATE)
task.record.title

// A LIVE QUERY. Re-renders whenever any write changes which records match.
const open = useStoreList<Task>({ query: { status: 'open' }, resource: TASK_STATE })
open.map(model => model.record.title)

// Everything in the store.
const all = useStoreList<Task>({ query: {}, resource: TASK_STATE })
```

A query subscription creates nothing and re-evaluates on every create, update and delete — a list
screen never recomputes ids and never re-subscribes to keep up. The criteria object is compared by
content, so a filter that changes narrows the list.

An **id** subscription is different on purpose: it CREATES a placeholder record so a screen has
something to bind to before the real one arrives. `useStoreModel(undefined)` therefore hands back a
record whose id is `DEFAULT_ID` — that sentinel, not `null`, is what "nothing loaded yet" looks
like:

```typescript
const loading = task.record.id === DEFAULT_ID
```

## Writing to it

The server is the source of truth; the store is what the screen reads. Fetch, then write what came
back into the store, and let the subscriptions render it:

```typescript
const store = ctx.getStateResource<Task>(TASK_STATE)

const [tasks] = await ctx.entrypoint<ClientEntrypoint<Task[]>>(TASK_LIST).call()
for (const task of tasks) {
  await store.save(task)
}
```

`save` creates or replaces. `update` requires the record to exist. `delete(id)` removes it. Each
one notifies every subscriber that cares.

### The commit rule

`StateModel.record` is a COPY. Assigning to it changes nothing anyone else can see:

```typescript
model.record.title = 'renamed'   // WRONG — a silent no-op, nothing re-renders
model.update({ title: 'renamed' })  // RIGHT — merges and commits
```

`update(data)` merges and commits in one step; `commit()` writes the current `record` back and is
what you call after assigning several fields; `clear()` deletes the record. `commit()` skips the
write when nothing actually changed, so calling it twice is free.

## Querying

`list`, `match` and the `query` subscription all take the same criteria language as the server
resources, so a filter written for an endpoint means the same thing applied locally:

```typescript
await store.all()                                   // every record, plain array
await store.match({ status: 'open' })               // the matching records, plain array
await store.list({ status: ['open', 'blocked'] })   // the Resource envelope: { items, pager }
await store.list({ criteria: { status: 'open' }, pager: { page: 0, size: 20, sort: ['createdAt'] } })
```

- A bare value is equality; a bare **array means "any of these"**.
- Operators: `$eq $ne $gt $gte $lt $lte $in $nin $exists $null $like $ilike $regex $startsWith
  $endsWith $between $contains $contained $overlaps`, and `$and $or $not` to combine.
- A dotted key reaches into the record (`'owner.team'`).
- A criteria value of `undefined` is SKIPPED — an untouched filter must not empty the list.
- `list()` with no arguments returns everything: a state resource is unpaged unless a pager is
  asked for, unlike a server resource that defaults to a page size.

`all()` and `match()` return plain arrays; `list()` returns `{ items, pager }` because that is the
`Resource` contract. Destructuring the wrong one is a silently empty render, so pick by shape.

## Subscribing outside React

```typescript
const [unsubscribe] = store.subscribe({ query: { status: 'open' }, listener: models => { ... } })
const stop = store.listen(models => { ... })   // every change, whatever it is
await store.erase()                            // drop everything
```

Subscribing the same listener function twice throws — hold the unsubscribe and call it instead.

## Depends On

- `@owlmeans/resource` — `StateResource` extends `Resource`
- `@owlmeans/context` — for `getStateResource`
- React hooks: `@owlmeans/client`
