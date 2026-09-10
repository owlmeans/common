# @owlmeans/state

The framework's client store: an in-memory `Resource` with live subscriptions.

## Overview

- `appendStateResource(context, alias, config?)` registers a store ON the context, so a screen, a
  service and a guard all reach the same records through the same container
- Reads and writes are the ordinary `Resource<T>` vocabulary — `get`, `load`, `list`, `count`,
  `create`, `update`, `save`, `delete`, `take`, `purge` — with the same criteria language the
  server resources speak
- `watch` follows one record and `query` follows a live set; both hand their listener a value
  synchronously, which is what lets React render from them without a loading frame
- A subscription READS the store. Watching an id the store knows nothing about creates nothing;
  the model it answers with is `empty`

## Installation

```bash
bun add @owlmeans/state@^0.1.18-rc.9
```

## Usage

Register a store per record type, and name it once with the type attached:

```typescript
import { appendStateResource, stateAlias } from '@owlmeans/state'

export const TASKS = stateAlias<Task>('tasks')

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeClientContext<C, T>(cfg)
  appendStateResource<C, T, Task>(context, TASKS)

  return context
}

const tasks = context.getStateResource(TASKS)   // StateResource<Task>
```

Every client context already carries one default `state` resource, so a store is only registered
when records of different kinds must not share an id space.

Read it from React with the hooks in [`@owlmeans/client`](../client):

```typescript
import { useStoreList, useStoreModel } from '@owlmeans/client'

const task = useStoreModel<Task>(id, 'tasks')                       // one record, live
const open = useStoreList<Task>({ query: { status: 'open' }, resource: 'tasks' })
```

Write through the resource, or through the model a subscription handed you:

```typescript
const tasks = context.getStateResource(TASKS)

await tasks.save(record)                 // create or replace
await tasks.replace(fromTheServer)       // write these, drop everything else
await tasks.purge({ status: 'done' })
await tasks.clear()

model.update({ status: 'done' })         // merge and write in one step
```

## API

### `createStateResource<T>(alias?, config?): StateResource<T>`

The bare factory, when the resource is registered by hand. `appendStateResource` is the usual way.

### `StateConfig<T>`

| Field | Meaning |
|-------|---------|
| `id` | The field records are keyed by. Defaults to `id` |
| `single` | The resource holds exactly ONE record, which needs no id — the current user, the active session, a wizard being filled in |
| `default` | What `StateModel.record` shows while the model is empty |

### `StateResource<T>` (extends `Resource<T>`, `PubSubResource<StateEvent<T>>`)

- `replace(records)` — write every record given and drop every record the list does not name, which
  is the shape of "the server just told us what exists"
- `clear()` — drop everything
- `watch(id, listener): () => void` — follow one record. `undefined` addresses the one record of a
  `single` resource and throws `StateConfigError.NonSingle` on any other
- `query(where, listener, opts?): () => void` — follow a live set, re-evaluated on every write that
  changes the answer. `undefined` matches everything
- `publish(event, channel?)` / `subscribe(handler, opts?)` — the change stream. Every write
  announces itself as a `StateEvent` on the default channel

Reads are unpaged: `list()` returns the whole store, and `list(where, { page })` without a `size`
is refused rather than silently answering with everything. Writes take no `ttl` — nothing here
expires.

### `StateModel<T>`

- `id` / `empty` / `record` — `empty` is what "nothing loaded yet" looks like; `record` is the
  configured `default` while it is true
- `update(patch)` — merge and write in one step
- `commit()` — write what `record` currently holds, including a default not yet stored
- `clear()` — delete the record

`record` is a snapshot: assigning into it changes nothing anyone else can see. `update` is how a
change reaches the store and every other subscriber.

### `stateAlias<T>(alias)`

An alias that remembers the record type it addresses, so `getStateResource(TASKS)` is typed without
repeating `<Task>` at every call site. It is the plain string at runtime.

### `StateConfigError`

`NonSingle` — a record was addressed without an id on a resource that holds many.
`NoId` — a write carried no value for the id field, and nothing here mints one.

## Criteria

The criteria language, the operators and the in-memory engine (`matchCriteria`, `filterRecords`,
`sortRecords`, `firstMatch`, `applyQuery`) all live in
[`@owlmeans/resource`](../resource) — one filter object means the same thing whether it is
evaluated here or by a relational store.

## Related Packages

- [`@owlmeans/resource`](../resource) — the `Resource<T>` contract and the criteria engine
- [`@owlmeans/client`](../client) — `useStoreModel` / `useStoreList` React hooks

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
