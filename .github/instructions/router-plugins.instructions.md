---
description: "How OwlMeans UI routing plugins work — the RouterPlugin contract, cascade selection, choosing/switching the router at context provisioning (default OwlMeans vs opt-in react-router), and authoring a plugin. Use before wiring routing in an app or writing a routing plugin."
applyTo: "**/*.ts, **/*.tsx"
---

# OwlMeans routing plugins

OwlMeans UI routing is pluggable. `@owlmeans/router` is a **host**: it defines the `RouterService`
facade and a `RouterPlugin` registry, selecting the active plugin by **cascade** (priority + `match`).
Route descriptions are react-router-compatible (static, `:param`, nested, index), so the same route
trees work across plugins.

## Plugins

| Plugin | Package | Register | Priority |
|--------|---------|----------|----------|
| OwlMeans in-browser (default) | `@owlmeans/web-router` | `appendWebRouter(ctx)` | 0 |
| react-router v7 (opt-in) | `@owlmeans/web-router-react-router` | `appendReactRouter(ctx)` | 100 |
| SSR (future) | — | higher-priority `match: env => env.ssr` | >0 |

## Choosing the router at context provisioning

`web-client`/`web-panel` register the OwlMeans plugin by default. To switch to react-router, add it
in your `makeContext` — its higher priority wins:

```typescript
import { appendReactRouter } from '@owlmeans/web-router-react-router'
export const makeContext = (cfg) => { const c = makeBase(cfg); appendReactRouter(c); return c }
```

Do NOT pass a `provide`/`createBrowserRouter` prop anymore — routing resolves its compiler from the
active plugin (`context.router().compile`). The old `provide` export from `web-client` is a
deprecated `undefined`.

## RouterPlugin contract

`{ alias; priority?; mode?; match?(env,ctx); compile(routes,ctx); provider(); outlet(); useParams;
useLocation; useNavigate; useSearchParams }`. `RouteObject` (`{index?,path?,children?,Component?}`)
is the neutral IR both plugins consume. `RouterEnv` (`{hasWindow,ssr,request?}`) drives selection.

## Authoring a plugin

Reuse the pure matcher (`flattenRoutes`/`rankRouteBranches`/`matchRoutes` from `@owlmeans/router`),
expose `appendMyRouter(ctx) = ensureRouterService(ctx).registerPlugin(makeMyPlugin())`, set a
`priority`/`match` for your environment, and keep facade methods assignable (native-safety).
