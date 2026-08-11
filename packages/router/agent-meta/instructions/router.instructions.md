---
description: "How to use @owlmeans/router — the UI routing plugin host: RouterService registry, cascade selection, neutral route IR, and pure matcher. Use when registering a routing plugin, using the router service, or reusing the matcher."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/router

**Layer:** Core (L1)
**Install:** `"@owlmeans/router": "^0.1.15"` in `dependencies`

The plugin **host** for OwlMeans UI routing. Defines the contract, holds a registry of routing
plugins, and selects the active one by cascade. Concrete mechanics are plugins:
`@owlmeans/web-router` (default OwlMeans browser router) and `@owlmeans/web-router-react-router`
(opt-in react-router v7).

## Key Exports

| Export | Description |
|--------|-------------|
| `RouterService` | Facade + registry; `outlet/provider/useParams/useLocation/useNavigate/useSearchParams/compile` delegate to the active plugin. |
| `RouterPlugin`, `RouterEnv`, `RouteObject` | Plugin contract, selection env (`{hasWindow,ssr,request?}`), neutral route IR (`{index?,path?,children?,Component?}`). |
| `makeRouterService`, `ensureRouterService(ctx)` | Build / idempotently get the host. |
| `flattenRoutes`, `rankRouteBranches`, `matchRoutes` | Pure DOM-free matcher (static/`:param`/nested/index). |
| `defaultRouterEnv()`, `ROUTER_SERVICE`, `DEFAULT_ROUTER_PRIORITY`, `ROUTER_PLUGIN` | Env + constants. |

## Cascade

Plugins sorted by `priority` desc; `service.plugin(env?)` returns the first whose `match(env)` is
truthy (undefined ⇒ always). Browser plugin = priority 0, `match: () => true`; a higher-priority
SSR plugin can win when `env.ssr`. Facade methods stay writable (native monkey-patches them).

```typescript
import { ROUTER_SERVICE } from '@owlmeans/router'
ctx.service(ROUTER_SERVICE).useParams()   // delegates to the active plugin
```

## The host is a LAZY service

`makeRouterService` builds a **lazy** service (`createLazyService`) — the host has no async setup,
and plugin packages must reach it from an app's `makeContext`, i.e. while the context is still in
the Loading stage. `context.service()` throws for an uninitialized non-lazy service, which would
break `ensureRouterService` (and every `appendXxxRouter` on an existing host) exactly where apps
are told to call them. Keep it lazy when extending the host.

## Depends On

- `@owlmeans/context`; peer `react` (types only — no react-router, no DOM here)
