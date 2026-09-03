---
name: client
description: How to use @owlmeans/client — platform-agnostic React client framework (works with web and React Native) providing context, components, services, useNavigate/Navigator, useEntrypoint, RoutedComponent, store. Auto-invoked when importing client framework primitives or navigating between screens.
user-invocable: false
---

# @owlmeans/client

**Layer:** Client
**Install:** `"@owlmeans/client": "^0.1.18-rc.15"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `App` / context helpers | Mount the React app, provide context |
| `useNavigate` | Hook returning the `Navigator` — programmatic navigation by entrypoint alias |
| `useEntrypoint<T>()` | The `EntrypointContextParams` of the screen currently rendering — `{ alias, path, params, context }` |
| `RoutedComponent` | Type of a component elevated on a frontend entrypoint (takes `EntrypointContextParams` as props) |
| `handler(Component)` | Wrap a React component as an entrypoint handler |
| `useStoreModel` / `useStoreList` | React hooks over a `@owlmeans/state` resource — one record by id, or a live query. Not re-exported by `@owlmeans/web-client`; import them from here |
| `components` | Cross-platform components (e.g. error boundaries) |
| `value`, `debug` | Render-time helpers |
| Errors | Client-side typed errors |
| Constants | Default aliases |

## Subpath Exports

- `./utils` — generic client utilities

## Usage

This is the platform-agnostic substrate that `@owlmeans/web-client` (browser) and the native equivalent build on. Most apps import from `@owlmeans/web-client` directly; use `@owlmeans/client` only for cross-platform code.

Navigation addresses an ALIAS, never a URL — the path lives in the entrypoint declaration, so a
component never builds one. `useNavigate()` returns the `Navigator`, which asks the target
entrypoint for its `url(request)` and hands that to the active router plugin:

```typescript
import { useNavigate } from '@owlmeans/client'
import type { RoutedComponent } from '@owlmeans/client'

export const ProjectScreen: RoutedComponent = ({ params }) => {
  const nav = useNavigate()

  // `go` navigates; `press` returns the handler for an onClick. `params` fills the path
  // parameters of the target entrypoint, `query` the query string, `replace` swaps the
  // history entry instead of pushing one.
  void nav.go(PROJECT_ITEM, { params: { id: params.id }, query: { tab: 'files' } })

  return <a onClick={nav.press(PROJECT_LIST)}>Back to the list</a>
}
```

A URL that belongs to another service comes back absolute, and the navigator leaves the app for it
rather than pushing a history entry. `nav.navigate(entrypoint, request)` takes the entrypoint
itself when you already hold it; `nav.back()` / `nav.pressBack()` go one entry back, and
`nav.location()` reads the current one.

An elevated screen receives `{ alias, path, params, context }` as props, and `useEntrypoint()`
reads the same values from anywhere below it — read path parameters from `params` and pass them
down; a nested component never resolves route parameters itself.

## Client state

State lives on the context as a `@owlmeans/state` resource; these hooks subscribe to it.

```typescript
import { useStoreList, useStoreModel } from '@owlmeans/client'

const task = useStoreModel<Task>(id, TASKS)                              // one record
const open = useStoreList<Task>({ query: { status: 'open' }, resource: TASKS })  // live query
```

`useStoreModel` returns a `StateModel` — read `model.record`, write with `model.update({ ... })`.
Assigning into `model.record` reaches nobody: it is a snapshot, so nothing is written and nothing
re-renders. The hook never throws for missing data either — an id the store knows nothing about
yields a model whose `empty` is true, and nothing is written into the store on the way.
`useStoreList` takes `{ query?, sort?, resource? }` and matches everything when `query` is omitted.
Full contract: [[state]].

Both hooks subscribe in an effect through `useSyncExternalStore`, so a render never installs a
subscription and never leaves one behind.

## Depends On

- `@owlmeans/client-context`, `@owlmeans/client-entrypoint`, `@owlmeans/client-route`
- `@owlmeans/router`, `@owlmeans/auth-common`
- `react` (peer)
