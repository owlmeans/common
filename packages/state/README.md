# @owlmeans/state

The framework's client store: an in-memory `Resource` with live subscriptions, registered on the
client context. Use it for records a screen binds to: the projects list, the current user, a wizard
draft, optimistic updates, a socket feed being rendered. It is a store, not a security boundary,
and it does not survive a reload. Data that must outlive the tab goes in
[`@owlmeans/client-resource`](../client-resource) (IndexedDB through `web-db`). The truth stays on
the server, behind entrypoints and a database resource.

## Installation

```bash
bun add @owlmeans/state@^0.1.18-rc.26
```

## Concepts

- **State resource**: a `StateResource<T>` registered with `appendStateResource(context, alias,
  config?)`. It uses the full `Resource<T>` vocabulary (`get`, `load`, `list`, `count`, `create`,
  `update`, `save`, `delete`, `take`, `purge`) plus `replace` and `clear`. Every client context
  already carries a default one (`state`).
- **Typed alias**: `stateAlias<T>('tasks')` is a plain string at runtime that carries the record
  type, so `context.getStateResource(TASKS)` is typed without repeating `<Task>`.
- **Model**: a `StateModel<T>` wraps one record. `empty` means "nothing loaded yet", `record` is a
  read-only snapshot (the configured default while empty), and `update(patch)` merges and writes.
- **Live subscriptions**: `watch(id, listener)` follows one record, and `query(where, listener,
  opts?)` follows a live set. Both are synchronous and call the listener with the current value
  before they return, which lets React render without a loading frame.
- **Single store**: `{ single: true }` holds exactly one record that needs no id, for things like
  the current account or the active wizard.

## Usage

### Register stores in the context factory

```ts
import { appendStateResource, stateAlias } from '@owlmeans/state'

export const PROJECTS = stateAlias<Project>('project-state')
export const STORIES = stateAlias<Story>('story-state')

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)
  appendStateResource<C, T, Project>(context, PROJECTS)
  appendStateResource<C, T, Story>(context, STORIES)

  context.projectStore = () => context.getStateResource(PROJECTS)

  return context
}
```

`appendStateResource` is idempotent: appending an alias that already exists keeps the resource and
what it has collected. The `projectStore` accessor is an app-level convenience declared on the
app's own `Context` type.

### Fetch, then write what the server answered

```ts
const store = context.getStateResource(PROJECTS)

const { items } = await context.entrypoint(appProtocols.project.list).call({ query: { size: 50 } })
await store.replace(items)                              // write these, drop every other record

const project = await context.entrypoint(appProtocols.project.get).call({ params: { id } })
await store.save(project)                               // create or replace one
```

### Read it from React

The hooks live in [`@owlmeans/client`](../client):

```tsx
import { useStoreList, useStoreModel } from '@owlmeans/client'

export const useProjectState = (id?: string) => useStoreModel<Project>(id, PROJECTS)

export const ProjectCard: FC<{ id: string }> = ({ id }) => {
  const project = useProjectState(id)
  const stories = useStoreList<Story>({
    query: { projectId: id, status: ['planned', 'active'] },
    sort: [{ field: 'createdAt', order: 'desc' }],
    resource: STORIES
  })

  if (project.empty) {
    return <Spinner />
  }

  return <Card title={project.record.title} count={stories.length}
    onRename={title => project.update({ title })} />
}
```

### A single-record store with a default

```ts
export const DRAFT = stateAlias<InvoiceDraft>('invoice-draft')

appendStateResource<C, T, InvoiceDraft>(context, DRAFT, {
  single: true,
  default: () => ({ customerId: '', lines: [], currency: 'EUR' })
})

const draft = useStoreModel<InvoiceDraft>(undefined, DRAFT)   // no id: the sole record
await draft.update({ customerId })                            // persists default + patch
await draft.clear()                                           // back to empty after submit
```

### Fold a live feed into the store outside React

```ts
const store = context.getStateResource(STORIES)

const stopQuery = store.query({ status: 'active' }, models => {
  badge.set(models.length)                              // called now, then on every change to the set
})

socket.on('story', async (event: StoryEvent) => {
  if (event.type === 'removed') {
    await store.delete(event.id)
  } else {
    await store.save(event.story)
  }
})
```

## API

### `appendStateResource<C, T, R>(context, alias?, config?): T & StateResourceAppend`

Registers a state resource on the context (unless the alias is already registered) and installs
`getStateResource`. Without an alias it registers the default `state` store.

### `createStateResource<T>(alias?, config?): StateResource<T>`

The bare factory, for registering the resource by hand. `appendStateResource` is the usual way.

### `StateConfig<T>`

| Field | Meaning |
|-------|---------|
| `id` | The field records are keyed by. Defaults to `id` |
| `single` | The resource holds exactly ONE record, which needs no id: the current user, the active session, a wizard being filled in |
| `default` | `() => T`, what `StateModel.record` shows while the model is empty |

### `StateResource<T>` (extends `Resource<T>`, `PubSubResource<StateEvent<T>>`)

- `config`, the `StateConfig` it was created with
- `replace(records)`, which writes every record given and drops every record the list does not
  name. This is the shape of "the server just told us what exists", and subscribers wake once
- `clear()`, which drops everything
- `watch(id, listener): () => void`, which follows one record. An absent id on a listed store
  reports an empty model; on a `single` store it addresses the sole record
- `query(where, listener, opts?): () => void`, which follows a live set, re-evaluated on every
  write that changes the answer. `undefined` matches everything; `opts.sort` orders it
- `publish(event, channel?)` / `subscribe(handler, opts?)`, the change stream. Every write
  announces itself as a `StateEvent` on the default channel

Reads are unpaged: `list()` returns the whole store, and `list(where, { page })` without a `size`
is refused rather than silently answering with everything. Writes take no `ttl`, since nothing here
expires. The criteria language is the one from [`@owlmeans/resource`](../resource), including
dotted keys into nested fields.

### `StateModel<T>`

- `id` / `empty` / `record`: `empty` is what "nothing loaded yet" looks like; `record` is the
  configured `default` while it is true
- `update(patch)`, which merges and writes in one step
- `commit()`, which writes what `record` currently holds, including a default not yet stored
- `clear()`, which deletes the record

### Exports

| Symbol | Kind | Purpose |
|---|---|---|
| `appendStateResource` | function | Register a state resource on the context and install `getStateResource` |
| `createStateResource` | function | The bare factory |
| `stateAlias<T>(alias)` | function | An alias typed with its record |
| `createStateModel(binding)` | function | Wrap a record, or its absence, as a model for a store of your own |
| `StateResource<T>` | type | The resource interface |
| `StateModel<T>`, `StateModelBinding<T>` | type | The model and what `createStateModel` binds to |
| `StateConfig<T>`, `StateEvent<T>`, `StateAlias<T>` | type | Keying config, change event `{ type: 'set' \| 'remove', records }`, typed alias |
| `StateResourceAppend`, `GetStateResource` | type | The `getStateResource` mixin |
| `StateConfigError` | class | `NoId`: a write with no key value on a many-record store (`NonSingle` is declared beside it) |

## Common pitfalls

- **Assigning into `model.record`.** It does not reach subscribers and nothing re-renders. Write
  with `model.update({ ... })`.
- **Saving a server list record by record.** Records deleted elsewhere stay behind and subscribers
  wake once per record. Use `replace(records)`.
- **Treating an empty model as an error.** An unknown or not-yet-known id yields `empty: true` and
  writes nothing, so render a loading state.
- **Calling `getStateResource()` with no alias for a store you appended.** Without an alias it
  answers the default store. Always pass the alias.
- **Writing with no id on a many-record store.** It throws `StateConfigError` (`NoId`), because
  nothing here mints ids.
- **Passing `{ ttl }`**, or expecting data to survive a reload. Use `client-resource` for that.
- **Trusting the store on the server side.** The server re-validates everything that arrives.
- **Importing the React hooks from `@owlmeans/web-client`.** They are only exported by
  `@owlmeans/client`.

## Related packages

- [`@owlmeans/resource`](../resource): the `Resource<T>` contract and the criteria engine
- [`@owlmeans/client`](../client): `useStoreModel` / `useStoreList` React hooks
- [`@owlmeans/client-resource`](../client-resource): the client store that survives a reload
- [`@owlmeans/client-job`](../client-job): a worked example, a socket feed folded into a state resource

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.29
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
