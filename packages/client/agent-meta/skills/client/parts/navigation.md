---
name: navigation
description: Navigating by entrypoint alias with useNavigate and the Navigator, screen params through useEntrypoint, and how Router mounts frontend entrypoints and checks their guards.
metadata:
  purposes: navigation, screen
  mentions: useNavigate, Navigator, NavRequest, nav.go, nav.press, useEntrypoint, RoutedComponent, EntrypointContextParams, getGuards, frontend-guard
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client — Navigation and routing

## Navigation

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

A URL that comes back starting with `http` belongs to another service, and the navigator assigns
`location.href` rather than pushing a history entry. `nav.navigate(entrypoint, request)` takes the
entrypoint itself when you already hold it; `nav.back()` / `nav.pressBack()` go one entry back, and
`nav.location()` reads the current one.

A bound screen receives `{ alias, path, params, context }` as props, and `useEntrypoint()`
reads the same values from anywhere below it — read path parameters from `params` and pass them
down; a nested component never resolves route parameters itself.

## Routing and guards

`App` mounts `Router`, which resolves the frontend entrypoints the context holds into a nested
route tree. Only entrypoints whose route is `AppType.Frontend` are mounted, and among those only
the ones that name no service at all, name this app's service, or are `sticky`. Each node
contributes **only its own segment** — its ancestors already carry theirs, so a declaration nests
by naming a `parent`.

A screen's guards are its own plus every ancestor's, taken from `getGuards()`. An empty list is an
open screen; when the list is non-empty and no guard matches, the renderer throws
`AuthorizationError('frontend-guard')`.

**A navigation never remounts a mounted route.** `handler(Component)` builds its component once,
when the entrypoint is bound, and the route renderer (`utils/route.tsx`) memoizes it once per route
— so the React type under a route stays the same across renders. A query-only change (`?tab=`), a
changed parameter on the same route, or a move between child screens re-renders the layout and
keeps it mounted, together with its state, its modal host and an open `ctx.modal()` body; only a
route that stops matching unmounts. A screen that must reset on a parameter change keys its own
subtree on that parameter. A custom entrypoint handler that answers a new function per call opts
out of this, since a different function is a different type.
