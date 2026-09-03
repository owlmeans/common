---
name: router-plugins
description: How OwlMeans UI routing plugins work — the RouterPlugin contract, cascade selection, choosing/switching the router at context provisioning (default OwlMeans vs opt-in react-router), and authoring a new plugin (e.g. SSR). Read before wiring routing in an app or writing a routing plugin.
user-invocable: false
metadata:
  scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# OwlMeans routing plugins

OwlMeans UI routing is pluggable. The core `@owlmeans/router` package is a **host**: it defines the
`RouterService` facade and holds a registry of `RouterPlugin`s, selecting the active one by
**cascade**. Route *descriptions* are react-router-compatible (same path placeholders: static,
`:param`, nested, index) so the same route trees work across plugins.

## Plugins that ship today

| Plugin | Package | Registration | Priority |
|--------|---------|--------------|----------|
| OwlMeans in-browser (default) | `@owlmeans/web-router` | `appendWebRouter(ctx)` | 0 |
| react-router v7 (opt-in) | `@owlmeans/web-router-react-router` | `appendReactRouter(ctx)` | 100 |
| Native (RN) | `@owlmeans/native-router` | native app wiring | — |
| SSR | *(future)* | higher-priority `match: env => env.ssr` | >0 |

## Choosing the router at context provisioning

`@owlmeans/web-client` (and `web-panel`) call `appendWebRouter` by default, so **OwlMeans routing is
the default**. To switch a specific app to react-router, add the opt-in plugin in your `makeContext`
— its higher priority wins the cascade:

```typescript
import { makeContext as makeBase } from '@owlmeans/web-panel'
import { appendReactRouter } from '@owlmeans/web-router-react-router'

export const makeContext = (cfg) => {
  const context = makeBase(cfg)
  appendReactRouter(context)   // now react-router handles routing instead of OwlMeans
  return context
}
```

Nothing passes a `provide`/`createBrowserRouter` prop to `<App>`/`<PanelApp>` — routing resolves
its compiler from the active plugin (`context.router().compile`).

## The RouterPlugin contract

```typescript
interface RouterPlugin {
  alias: string
  priority?: number                                   // higher wins; default 0
  mode?: string                                        // 'browser' | 'ssr' | …
  match?: (env: RouterEnv, ctx?) => boolean            // undefined ⇒ always applies
  compile: (routes: RouteObject[], ctx?) => LibraryRouter | Promise<LibraryRouter>
  provider: () => ComponentType<{ router }>            // renders the compiled router
  outlet: () => ComponentType                          // renders the next nested match
  useParams; useLocation; useNavigate; useSearchParams // hooks backed by the plugin
}
```

- `RouteObject` is the neutral IR (`{ index?, path?, children?, Component? }`), produced by
  `@owlmeans/client` from the entrypoint tree — the same objects both plugins consume.
- `RouterEnv` (`{ hasWindow, ssr, request? }`) drives selection. The browser plugin matches always;
  an SSR plugin would register at a higher priority with `match: env => env.ssr`.

## Authoring a plugin (e.g. SSR)

1. Implement `RouterPlugin` (reuse the pure matcher from `@owlmeans/router`: `flattenRoutes`,
   `rankRouteBranches`, `matchRoutes` — they are DOM-free and SSR-safe).
2. Expose `appendMyRouter(ctx)` = `ensureRouterService(ctx).registerPlugin(makeMyPlugin())`.
3. Set `priority` above the default (0) and a `match` that fires only in your environment.
4. Keep the `RouterService` facade methods assignable (native-safety invariant).

## Related

- [[router]] (host + matcher) · [[web-router]] (default browser plugin)
- `@owlmeans/web-router-react-router` (react-router plugin)
