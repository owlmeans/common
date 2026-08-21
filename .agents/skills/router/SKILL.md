---
name: router
description: How to use @owlmeans/router — the UI routing plugin HOST (RouterService registry + cascade selection + neutral route IR + pure matcher). Auto-invoked when importing router service types, the matcher, or implementing/registering a routing plugin.
user-invocable: false
---

# @owlmeans/router

**Layer:** Core (L1)
**Install:** `"@owlmeans/router": "^0.1.18-rc.6"` in `dependencies`

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
| `makeRouterService(alias?)` | Build an empty host. |
| `ensureRouterService(ctx)` | Idempotently get/create the host on a context (plugin packages call this before `registerPlugin`). |
| `flattenRoutes` / `rankRouteBranches` / `matchRoutes` | Pure, DOM-free matcher (static / `:param` / nested / index). |
| `defaultRouterEnv()` | Default environment (`window`-based); override per-request for SSR. |
| Constants | `ROUTER_SERVICE` (`'router-service'`), `DEFAULT_ROUTER_PRIORITY`, `ROUTER_PLUGIN`. |

## Cascade selection

Plugins are kept sorted by `priority` (desc, stable). `service.plugin(env?)` returns the first
plugin whose `match(env, ctx)` is truthy (`match` undefined ⇒ always applies). The browser plugin
registers at priority 0 with `match: () => true` (universal fallback); a higher-priority SSR plugin
can later win when `env.ssr` is true. Every facade call re-selects, so plugins can be added at any
time (e.g. `appendReactRouter(ctx)` outranks the default).

```typescript
import { ROUTER_SERVICE } from '@owlmeans/router'
const params = ctx.service(ROUTER_SERVICE).useParams()   // delegates to the active plugin
```

## The host is a LAZY service

`makeRouterService` builds a **lazy** service (`createLazyService`). The host carries no async
setup, and plugin packages must be able to reach it from an app's `makeContext` — i.e. while the
context is still in the Loading stage. `context.service()` throws for an uninitialized non-lazy
service, which would make `ensureRouterService` (and therefore `appendReactRouter` /
`appendWebRouter` on an existing host) fail exactly where apps are told to call them. Keep the host
lazy when extending it.

## Native-safety invariant

The facade methods are **plain writable instance properties**, never getters — the native router
(`@owlmeans/native-router`) monkey-patches `service.outlet = …` directly. When extending the host,
keep them assignable.

## Depends On

- `@owlmeans/context` — service registration
- peer `react` — component/hook types only (no react-router, no DOM here)

## Related

- [[web-router]] (default OwlMeans browser plugin) · [[router-plugins]] (authoring plugins)
- `@owlmeans/web-router-react-router` (react-router plugin)
