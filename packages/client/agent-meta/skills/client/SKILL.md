---
name: client
description: How to use @owlmeans/client — platform-agnostic React client framework (works with web and React Native) providing context, components, services, useNavigate/Navigator, RoutedComponent, store. Auto-invoked when importing client framework primitives or navigating between screens.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client

**Layer:** Client
**Install:** `"@owlmeans/client": "^0.1.18-rc.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `App` / context helpers | Mount the React app, provide context |
| `useNavigate` | Hook returning the `Navigator` — programmatic navigation by entrypoint alias |
| `RoutedComponent` | Type of a component elevated on a frontend entrypoint (`{ alias, path, params, context }` props) |
| `entrypoint` helpers | Resolve entrypoints by alias |
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
component never builds one. `useNavigate()` returns the `Navigator`:

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

`nav.back()` / `nav.pressBack()` go one entry back, and `nav.location()` reads the current one.
An elevated screen receives `{ alias, path, params, context }` as props — read path parameters
from `params` and pass them down; a nested component never resolves route parameters itself.

## Client state

State lives on the context as a `@owlmeans/state` resource; these hooks subscribe to it.

```typescript
import { useStoreList, useStoreModel } from '@owlmeans/client'

const task = useStoreModel<Task>(id, TASK_STATE)                              // one record
const open = useStoreList<Task>({ query: { status: 'open' }, resource: TASK_STATE })  // live query
```

`useStoreModel` returns a `StateModel` — read `model.record`, write with `model.update({ ... })`.
Assigning to `model.record` directly is a silent no-op. Full contract: [[state]].

## Depends On

- `@owlmeans/client-context`, `@owlmeans/client-entrypoint`, `@owlmeans/client-route`
- `@owlmeans/router`, `@owlmeans/auth-common`
- `react` (peer)
