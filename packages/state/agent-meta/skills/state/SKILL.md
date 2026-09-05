---
name: state
description: How to use @owlmeans/state — appendStateResource() to register a client state resource on a context, useStoreModel/useStoreList to read it from React, watch/query live subscriptions, and the StateModel commit semantics. Auto-invoked when importing state primitives or building client-side application state.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/state

**Layer:** Core
**Install:** `"@owlmeans/state": "^0.1.18-rc.10"` in `dependencies`

The framework's client store. A state resource is a `Resource` like any other, registered **on the
context** — which is what separates it from a store held beside the app: a screen, a service and a
guard all reach the same records through the same container. Reads and writes are the resource
vocabulary of [[resource]]; `watch` and `query` are the live half.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendStateResource<C, T, R>(context, alias?, cfg?)` | Register a state resource on the context |
| `createStateResource<T>(alias?, cfg?)` | The bare factory, when you register it yourself |
| `stateAlias<T>(alias)` | Name a store once with the record type attached — `StateAlias<T>` |
| `StateResource<T>` | The resource interface — full CRUD plus `replace`, `clear`, `watch`, `query`, `publish`/`subscribe` |
| `StateModel<T>` | The subscribed wrapper — `id`, `empty`, `record`, `update`, `commit`, `clear` |
| `StateConfig<T>` | How the store is keyed — `id`, `single`, `default`. Readable back as `resource.config` |
| `StateEvent<T>` | What a change looks like on the wire — `{ type: 'set' \| 'remove', records }` |
| `createStateModel(binding)` / `StateModelBinding<T>` | Wrap a record — or its absence — as a model, for a store of your own |
| `StateResourceAppend` / `GetStateResource` | The `getStateResource` mixin `appendStateResource` installs |
| `StateConfigError` | `NoId` — a write with no value for the key field on a store that holds many records. `NonSingle` is declared beside it for an id-less address on a many-record store, but every such path either answers an empty model (`watch`) or raises `NoId`, so `NoId` is the one a caller meets |

The criteria evaluator (`matchCriteria`, `filterRecords`, `sortRecords`, `applyQuery`) lives in
**`@owlmeans/resource`** — the same engine the store runs on, for filtering a list you already hold.

The React hooks live in **`@owlmeans/client`** — `useStoreModel`, `useStoreList`. They are not
re-exported by `@owlmeans/web-client`, so import them from `@owlmeans/client` directly.

## Registering

Every client context already carries one default state resource, so `useStoreModel(id)` works with
no setup at all. Register a named one per entity when records of different kinds must not share an
id space:

```typescript
import { appendStateResource, stateAlias } from '@owlmeans/state'

export const TASKS = stateAlias<Task>('task-state')

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeClientContext<C, T>(cfg)
  appendStateResource<C, T, Task>(context, TASKS)
  return context
}
```

Reach it with `context.getStateResource(TASKS)` — a `StateAlias<T>` carries the record type, so the
accessor is typed without repeating `<Task>` at every call site. `getStateResource()` with no alias
answers the context's own default store (`state`), so always name the alias for a store you
appended. `appendStateResource` is idempotent: appending the same alias twice keeps the resource
already there, so a setup that runs more than once does not drop what the store has collected.

`StateConfig` decides how the store is keyed and what it shows before anything is loaded — all of it
optional:

| Field | Meaning |
|---|---|
| `id` | The field records are keyed by. Defaults to `id`. |
| `single` | The store holds exactly ONE record, which therefore needs no id — the current user, the active session, a wizard being filled in. It is what makes `watch(undefined, …)` (and so `useStoreModel()` with no id) answerable. |
| `default` | `() => T` — what `model.record` shows while the model is empty. A screen binds to it instead of guarding every field, and the store still holds nothing. |

## Reading it from React

```typescript
import { useStoreList, useStoreModel } from '@owlmeans/client'

// One record, by id. Re-renders whenever that record changes.
const task = useStoreModel<Task>(id, TASKS)
task.record.title

// A LIVE QUERY. Re-renders whenever any write changes which records match.
const open = useStoreList<Task>({ query: { status: 'open' }, resource: TASKS })
open.map(model => model.record.title)

// Everything in the store, newest first.
const all = useStoreList<Task>({ sort: [{ field: 'createdAt', order: 'desc' }], resource: TASKS })
```

A query subscription creates nothing and re-evaluates on every create, update and delete — a list
screen never recomputes ids and never re-subscribes to keep up. The criteria object is compared by
content, so a filter that changes narrows the list. An omitted `query` matches everything.

**"Nothing loaded yet" is `model.empty`.** An id the store knows nothing about yields a model whose
`empty` is true, and nothing is written into the store on the way — so `useStoreModel` never throws
for missing data, and a screen bound to an unknown id does not put a blank row into every list
reading the same store:

```typescript
if (task.empty) {
  return <Spinner/>
}
```

`model.record` is still readable while empty: it holds the resource's configured `default`, or `{}`
when there is none. Calling `model.update(...)` or `model.commit()` on an empty model writes it —
including the default it was showing.

An ABSENT id answers the same way. A screen binds to `useStoreModel(project.record.id)` while the
project is still loading, so a missing id is a rendering state rather than a mistake: on a listed
store it watches nothing and reports an empty model, and on a `single` store it addresses that
store's sole record. The empty model it hands back is one shared instance, so a React subscriber
does not see a new value on every render — and writing through it throws `StateConfigError`
(`NoId`), because a caller writing with no id has lost track of which record it meant.

## Writing to it

The server is the source of truth; the store is what the screen reads. Fetch, then write what came
back into the store, and let the subscriptions render it:

```typescript
const store = ctx.getStateResource(TASKS)

const tasks = await ctx.entrypoint<ClientEntrypoint<Task[]>>(TASK_LIST).call()
await store.replace(tasks)
```

`replace(records)` makes the store agree with an authoritative list: every record given is written,
and every record the list does not name is dropped. That is the shape of "the server just told us
what exists" — saving each record one by one leaves the ones deleted elsewhere behind, and one
write wakes the subscribers once instead of once per record. The store is rewritten before anything
is told about it, so a subscriber never sees the half-applied set.

For single records: `save` creates or replaces, `create` refuses an id already there, `update`
requires the record to exist, `delete(id)` removes it and answers with what it removed, `take(id)`
is the same read but throws when the record is absent, `purge(where)` bulk-deletes (and refuses an
empty criteria object rather than emptying the store), and `clear()` drops everything. Each one
notifies every subscriber that cares.

On a store that holds many records, a write carrying no value for the key field throws
`StateConfigError` (`NoId`) — nothing here mints ids. A write carrying a `ttl` throws
`UnsupportedArgumentError`: the store keeps no expiring records, so a ttl would be silently
dropped.

On a `single` store every write lands in the one slot, so `replace([a, b])` keeps only the last of
them. The key field is never consulted on the way in: an id-less `save`, `create`, `update` or
`replace` is filed there normally and the record keeps whatever id it arrived with, or none.
`create` still refuses a slot already filled and `update` still requires it filled, both naming the
resource alias rather than an id.

`get(id)` / `load(id)` answer the sole record unless it carries a DIFFERENT id: a record stored with
`id: 'sid'` is a miss for any other name, while a record stored without an id at all — the shape a
single store invites, since it needs none — answers to every id asked for. Give the record an id
whenever a screen reads it by one, and treat an id-keyed read on an id-less single store as an
unconditional hit.

### The commit rule

`StateModel.record` is a SNAPSHOT. Assigning to it changes nothing anyone else can see:

```typescript
model.record.title = 'renamed'      // WRONG — a silent no-op, nothing re-renders
await model.update({ title: 'renamed' })  // RIGHT — merges and commits
```

`update(patch)` merges and commits in one step — batch several fields into one patch rather than
writing them one at a time. `commit()` writes what `record` currently holds, which is how an empty
model bound to a `default` is persisted as it stands. `clear()` deletes the record and leaves the
model empty again. The working copy is replaced rather than mutated on every write, so the record a
caller is holding never changes underneath it and two models of the same record stay comparable by
reference — which is what lets a React subscriber tell a real change from an unrelated one.

## Querying

Reads take the same criteria language as the server resources, so a filter written for an endpoint
means the same thing applied locally:

```typescript
await store.get(id)                                  // the record, or UnknownRecordError
await store.load({ status: 'open' })                 // the first match, or null
await store.list({ status: ['open', 'blocked'] })    // { items, total }
await store.list({ status: 'open' }, { sort: ['createdAt'], size: 20 })
await store.count({ status: 'open' })
```

- A bare value is equality; a bare **array means "any of these"**.
- Operators: `$eq $ne $gt $gte $lt $lte $in $nin $exists $null $like $ilike $regex $startsWith
  $endsWith $between $contains $contained $overlaps`, and `$and $or $not` to combine.
- A dotted key reaches into the record (`'owner.team'`).
- `null` matches absence; a criteria value of `undefined` is SKIPPED — an untouched filter must not
  empty the list.
- `Sort<T>` is a field name (ascending) or `{ field, order: 'asc' | 'desc' }`.

`list()` returns `{ items, total }` and is **unpaged**: the store is already in memory and a screen
reading it expects all of it. Ask for a `size` to page, and `size: 0` still means no limit. A `page`
with no `size` throws `UnsupportedArgumentError('page-without-size')` — there is no default page
size to count against.

## Subscribing outside React

```typescript
const stopOne = store.watch(id, model => { … })                    // one record
const stopMany = store.query({ status: 'open' }, models => { … })  // a live query
const stopAll = store.query(undefined, models => { … }, { sort: ['createdAt'] })
```

Both are **synchronous** and both are seeded before they return: the listener is called with the
current value straight away, then again on every change — including a removal, which reaches a
`watch` listener as an empty model. `watch(undefined, …)` on a listed store seeds an empty model
and subscribes to nothing. Each returns its unsubscribe, and a `query` listener is called again
only when the set of matching models actually changed, so an unrelated write re-renders nothing.

Writes announce themselves on the default channel, so `publish` is for what the store cannot know
it did — a change that arrived from elsewhere, or a channel of a caller's own:

```typescript
const stop = await store.subscribe(event => { … })                  // every write: StateEvent<T>
await store.publish({ type: 'set', records: [task] }, 'from-socket')
const once = await store.subscribe(handler, { channel: 'from-socket', once: true, ttl: 60 })
```

## Depends On

- `@owlmeans/resource` — `StateResource` extends `Resource` and `PubSubResource`
- `@owlmeans/context` — `appendContextual`, and the `getStateResource` mixin

## Related

- `resource` — the criteria language, paging and the base contract this implements
- `client` — where the React hooks live; it depends on this package, not the other way round
- `client-job` — a worked store: a socket feed folded into a state resource
