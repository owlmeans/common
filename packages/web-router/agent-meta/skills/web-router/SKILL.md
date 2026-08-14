---
name: web-router
description: How to use @owlmeans/web-router — the DEFAULT OwlMeans in-browser routing plugin (History API + pure matcher + React provider/outlet/hooks). Auto-invoked when wiring web routing or importing the browser plugin.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-router

**Layer:** Web (React), build level L2
**Install:** `"@owlmeans/web-router": "^0.1.16"` in `dependencies`

As of the pluggable-routing rework this package **is the default OwlMeans in-browser router** — a
minimal, react-router-free implementation of standard URL routing over the browser History API. It
registers itself as a `RouterPlugin` on the `@owlmeans/router` host. (react-router now lives in the
separate opt-in `@owlmeans/web-router-react-router` package.)

## Key Exports

| Export | Description |
|--------|-------------|
| `appendWebRouter(ctx)` | Register the OwlMeans browser plugin on a context's router host (idempotent via `ensureRouterService`). Called transparently by `@owlmeans/web-client`. |
| `makeBrowserRouterPlugin()` | The `RouterPlugin` itself (alias `owlmeans-browser-router`, priority 0). |
| `makeWebRouterService()` | Back-compat: a host pre-loaded with the browser plugin. |
| `BrowserRouterProvider`, `Outlet` | React provider/outlet components. |
| `RouteChain` | Renders the matched chain from a given depth, skipping `Component`-less matches (used by the provider and `Outlet`). |
| `useParams` / `useLocation` / `useNavigate` / `useSearchParams` | The plugin's hooks (usually reached via `context.router().…`). |
| `createBrowserHistory()` | History API wrapper (push/replace/go/popstate). |

## How it works

- `compile(routes)` flattens + ranks the neutral `RouteObject[]` into matchable branches (using the
  `@owlmeans/router` matcher). No async, no react-router.
- `BrowserRouterProvider` subscribes to history, re-matches on navigation, and renders the match
  chain via `RouteChain`; `<Outlet/>` renders the next-deeper match (depth tracked via context).
  Composes unchanged with the `@owlmeans/client` route renderer (parent components emit `<Outlet/>`).
- **Component-less matches are pass-through** — exactly like react-router's implicit `<Outlet/>` for
  element-less routes. `@owlmeans/client` emits `RouteObject`s with no `Component` for modules that
  have no handler (grouping modules such as `client-authentication` →
  `client-authentication:authentication`), so rendering only the exact node at a depth would blank
  the whole subtree. `RouteChain` walks down to the first match that has a `Component`, and the
  `OutletContext` depth it publishes is that match's depth, so nested outlets stay aligned.
- Supported route syntax: static segments, `:param`, nested (parent/child), index (`default:true`).
  **No splat/optional yet** (a seam is reserved).

## Usage

Wired transparently by `@owlmeans/web-client` / `@owlmeans/web-panel`. To switch an app to
react-router instead, call `appendReactRouter(ctx)` from `@owlmeans/web-router-react-router` in
your `makeContext` — its higher priority wins the cascade.

```typescript
import { appendWebRouter } from '@owlmeans/web-router'
appendWebRouter(context) // default; OwlMeans browser routing
```

## Depends On

- `@owlmeans/router` (host + matcher), `@owlmeans/context`
- peer `react` (no react-router)

## Related

- [[router]] (host) · [[router-plugins]] (authoring) · `web-router-react-router` (opt-in RR plugin)
