# @owlmeans/client

Core React client framework providing hooks, context, navigation, and state management for OwlMeans frontends.

## Overview

- React hooks for subscribing to state stores (`useStoreModel`, `useStoreList`) and async data (`useValue`)
- `useNavigate()` — entrypoint-aware navigation that builds URLs and drives the router
- `useContext()` — access the application's `ClientContext` from any React component
- `useEntrypoint()` — the alias, params and path of the entrypoint that rendered the current screen
- `useToggle()` — boolean state toggle hook
- Used by every React frontend in the OwlMeans ecosystem

## Installation

```bash
bun add @owlmeans/client@^0.1.18-rc.15
```

## Usage

Subscribe to a state store record:

```typescript
import { useStoreModel, useStoreList } from '@owlmeans/client'

function ProjectView({ projectId }: { projectId: string }) {
  const model = useStoreModel<ProjectState>(projectId, 'project-state')
  if (model.empty) return <Loading />

  return <div>{model.record.title}</div>
}
```

Subscribe to a live list:

```typescript
const open = useStoreList<ProjectState>({
  query: { status: ['draft', 'active'] },
  sort: [{ field: 'createdAt', order: 'desc' }],
  resource: 'project-state'
})
```

Load async data:

```typescript
import { useValue } from '@owlmeans/client'

function StoryList({ projectId }: { projectId: string }) {
  const stories = useValue(async () => {
    return await ctx.story().list({ projectId })
  }, [projectId])

  return stories ? <List items={stories.items} /> : <Loading />
}
```

Navigate to an entrypoint:

```typescript
import { useNavigate } from '@owlmeans/client'

function CreateButton() {
  const navigate = useNavigate()
  return <button onClick={() => navigate.go('project-create')}>Create</button>
}
```

## API

### `useStoreModel<T>(id?, alias?): StateModel<T>`

One record from a state resource, live. An id the store knows nothing about yields a model whose
`empty` is true — `record` gives the resource's configured default and nothing is written on the
way — so the hook never throws for missing data. Passing no id addresses the one record of a
`single` resource; on any other that is a configuration error and throws.

### `useStoreList<T>(opts?): StateModel<T>[]`

A live list from a state resource: every record `opts.query` accepts, re-evaluated on every write
that changes the answer. `opts` takes `query` (a `Criteria<T>`; omitted matches everything), `sort`
and `resource` (the context's default state resource when omitted).

### `useValue<T>(loader, deps?, forceDefault?): T | null`

Async data loader hook. Re-runs when `deps` change. Returns `null` while loading.

### `useNavigate(): Navigator`

Returns a navigator with:
- `navigate(entrypoint, request?)` — navigate to a `ClientEntrypoint`, addressed by its `url()`
- `go(alias, request?)` — navigate by entrypoint alias
- `press(alias, request?)` / `pressBack()` — the same as event handlers
- `back()` / `location()`

### `useContext<T>(): T`

Returns the current `ClientContext` cast to `T`.

### `useEntrypoint<T>(): EntrypointContextParams<T>`

The `alias`, `params`, `path` and `context` of the entrypoint that rendered the current screen.

### `useToggle(initial?): [boolean, () => void]`

Simple boolean toggle hook.

## Related Packages

- [`@owlmeans/state`](../state) — `StateModel`, `StateResource` used by `useStoreModel`
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — `ClientEntrypoint` used by `useNavigate`
- [`@owlmeans/client-context`](../client-context) — `ClientContext` returned by `useContext`

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
