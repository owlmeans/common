---
name: router
description: How to use @owlmeans/router — the UI routing plugin HOST (RouterService registry + cascade selection + neutral route IR + pure matcher) and the hook types every plugin implements. Auto-invoked when importing router service types, the matcher, or implementing/registering a routing plugin.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/router

**Layer:** Core (L1)
**Install:** `"@owlmeans/router": "^0.1.18-rc.8"` in `dependencies`

`@owlmeans/router` is the **plugin host** for OwlMeans UI routing. It does not talk to any
concrete router; it defines the contract, holds a registry of routing plugins, and selects the
active one by cascade. Concrete mechanics ship as plugins: `@owlmeans/web-router` (the default
OwlMeans in-browser router) and `@owlmeans/web-router-react-router` (opt-in react-router v7).

## Key Exports

| Export | Description |
|--------|-------------|
| `RouterService` | Facade + plugin registry. `outlet/provider/useParams/useLocation/useNavigate/useSearchParams/compile` all delegate to the active plugin. |
| `RouterPlugin` | The interface a routing mechanic implements. |
| `RouterEnv` | `{ hasWindow, ssr, request? }` — drives cascade selection (SSR pre-design seam). |
| `RouteObject` | Neutral route IR: `{ index?, path?, children?, Component? }` — shape-compatible with react-router. |
| `LibraryRouter` / `RouterProvider` | The opaque compiled router, and the component that renders it. |
| `makeRouterService(alias?)` | Build an empty host. |
| `ensureRouterService(ctx)` | Idempotently get/create the host on a context (plugin packages call this before `registerPlugin`). |
| `flattenRoutes` / `rankRouteBranches` / `matchRoutes` | Pure, DOM-free matcher (static / `:param` / nested / index). |
| `splitPath` / `segmentsOf` | The matcher's path primitives. |
| `RouteBranch` / `RouteMatch` / `PatternSegment` / `RouteParams` | What the matcher produces. |
| `UseParamsHook`, `UseLocationHook`, `UseNavigateHook`, `UseSearchParamsHook` | The hook signatures a plugin must satisfy. |
| `Location`, `Path`, `NavigateFunction`, `NavigateOptions`, `SetSearchParams` | The navigation value types those hooks trade in. |
| `defaultRouterEnv()` | Default environment (`window`-based); override per-request for SSR. |
| Constants | `ROUTER_SERVICE` / `DEFAULT_ALIAS` (`'router-service'`), `DEFAULT_ROUTER_PRIORITY`, `ROUTER_PLUGIN`. |

## Cascade selection

Plugins are kept sorted by `priority` (desc, stable) and are keyed by `alias` — re-registering the
same alias replaces the earlier plugin rather than stacking. `service.plugin(env?)` returns the
first plugin whose `match(env, ctx)` is truthy (`match` undefined ⇒ always applies), and throws
when none matches. The browser plugin registers at priority 0 with `match: () => true` (universal
fallback); a higher-priority SSR plugin can later win when `env.ssr` is true. Every facade call
re-selects, so plugins can be added at any time (e.g. `appendReactRouter(ctx)` outranks the
default).

```typescript
import { ROUTER_SERVICE } from '@owlmeans/router'
const params = ctx.service(ROUTER_SERVICE).useParams()   // delegates to the active plugin
```

Inside a client app reach the same facade as `context.router()`.

## The host is a LAZY service

`makeRouterService` builds a **lazy** service (`createLazyService`). The host carries no async
setup, and plugin packages must be able to reach it from an app's `makeContext` — i.e. while the
context is still in the Loading stage. `context.service()` throws for an uninitialized non-lazy
service, which would make `ensureRouterService` (and therefore `appendReactRouter` /
`appendWebRouter` on an existing host) fail exactly where apps are told to call them. Keep the host
lazy when extending it.

## The matcher

`flattenRoutes` turns a `RouteObject` tree into branches (each carrying the root→node chain that
drives outlet depth), `rankRouteBranches` orders them the way react-router would — static beats
dynamic, deeper beats shallower — and `matchRoutes` returns the matched chain with its params. It
is pure and DOM-free, so an SSR plugin can reuse it as is. It implements exactly static segments,
`:param`, nested routes and index routes; splat (`*`) and optional (`:x?`) segments are not
implemented, so do not declare them in a route tree.

## Native-safety invariant

The facade methods are **plain writable instance properties**, never getters — an alternative
implementation (a React Native host, for one) replaces them by assigning `service.outlet = …`
directly. When extending the host, keep them assignable.

## Depends On

- `@owlmeans/context` — service registration
- peer `react` — component/hook types only (no react-router, no DOM here)

## Related

- [[web-router]] (default OwlMeans browser plugin) · [[router-plugins]] (authoring plugins)
- [[web-router-react-router]] (react-router plugin)
