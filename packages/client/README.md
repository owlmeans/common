# @owlmeans/client

Core React client framework providing hooks, context, navigation, and state management for OwlMeans frontends.

## Overview

- React hooks for subscribing to state stores (`useStoreModel`, `useStoreList`) and async data (`useValue`)
- `useNavigate()` — module-aware navigation that resolves URLs and calls the router
- `useContext()` — access the application's `ClientContext` from any React component
- `useToggle()` — boolean state toggle hook
- Used by every React frontend in the OwlMeans ecosystem

## Installation

```bash
bun add @owlmeans/client
```

## Usage

Subscribe to a state store record:

```typescript
import { useStoreModel, useStoreList } from '@owlmeans/client'

function ProjectView({ projectId }: { projectId: string }) {
  const model = useStoreModel<ProjectState>(projectId, 'project-state')
  return <div>{model.record.title}</div>
}
```

Load async data:

```typescript
import { useValue } from '@owlmeans/client'

function StoryList({ projectId }: { projectId: string }) {
  const stories = useValue(async () => {
    return await ctx.story().list({ criteria: { projectId } })
  }, [projectId])

  return stories ? <List items={stories.items} /> : <Loading />
}
```

Navigate to a module:

```typescript
import { useNavigate } from '@owlmeans/client'

function CreateButton() {
  const navigate = useNavigate()
  return <button onClick={() => navigate.go('project-create')}>Create</button>
}
```

## API

### `useStoreModel<T>(id?, opts?): StateModel<T>`

Returns a single `StateModel` from a state resource. Creates the record if it doesn't exist.

### `useStoreList<T>(ids?, opts?): StateModel<T>[]`

Returns multiple `StateModel` instances from a state resource.

### `useValue<T>(loader, deps?, forceDefault?): T | null`

Async data loader hook. Re-runs when `deps` change. Returns `null` while loading.

### `useNavigate(): Navigator`

Returns a navigator with:
- `navigate(module, request?)` — navigate to a `ClientModule`
- `go(alias, request?)` — navigate by module alias

### `useContext<T>(): T`

Returns the current `ClientContext` cast to `T`.

### `useToggle(initial?): [boolean, () => void]`

Simple boolean toggle hook.

## Related Packages

- [`@owlmeans/state`](../state) — `StateModel`, `StateResource` used by `useStoreModel`
- [`@owlmeans/client-module`](../client-module) — `ClientModule` used by `useNavigate`
- [`@owlmeans/client-context`](../client-context) — `ClientContext` returned by `useContext`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
