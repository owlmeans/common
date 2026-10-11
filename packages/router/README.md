# @owlmeans/router

The plugin host for OwlMeans UI routing. It defines the `RouterService` facade (`outlet`,
`provider`, `useParams`, `useLocation`, `useNavigate`, `useSearchParams`, `compile`), keeps a
registry of `RouterPlugin`s and selects the active one by cascade, and ships the neutral route IR
(`RouteObject`) plus a pure, DOM-free route matcher. An app imports it for the router types and the
`ROUTER_SERVICE` alias, and a plugin author builds on it. It does not route anything by itself — a
browser app gets the default OwlMeans router from `@owlmeans/web-router` (registered by
`@owlmeans/web-client` / `@owlmeans/web-panel`) or opts into react-router v7 with
`@owlmeans/web-router-react-router`. It has nothing to do with server HTTP routing; that is
`@owlmeans/server-route`. The package's skills are `router` and `router-plugins`.

## Installation

```bash
bun add @owlmeans/router@^0.1.18-rc.34
```

`react` is a peer dependency — the package uses its component types only.

## Concepts

- **Host** — `RouterService`, a lazy service registered under `ROUTER_SERVICE` (`'router-service'`).
  Every facade call re-selects the active plugin and delegates to it.
- **Plugin** — a `RouterPlugin`: one routing mechanic (browser History, react-router, SSR, native)
  with its own `compile`, provider, outlet and hooks. Plugins are keyed by `alias`; registering the
  same alias again replaces the earlier one.
- **Cascade** — plugins are kept sorted by `priority` (descending, stable). `plugin(env?)` returns
  the first whose `match(env, ctx)` is truthy (`match` omitted means "always applies") and throws
  when none matches.
- **Environment** — `RouterEnv` (`{ hasWindow, ssr, request? }`) is what `match` sees.
  `defaultRouterEnv()` derives it from `window`; an SSR host passes a per-request env.
- **Route IR** — `RouteObject` (`{ index?, path?, children?, Component? }`), shape-compatible with
  react-router's route objects, produced by `@owlmeans/client` from the entrypoint tree and consumed
  by every plugin.
- **Matcher** — `routeMatcherHelper`: flattens a route tree into branches, ranks them (static beats
  `:param`, deeper beats shallower) and matches a pathname to a root→leaf chain with merged params.

## Usage

### Read routing state through the facade

In a client app the facade is also reachable as `context.router()`; the alias works anywhere a
context is at hand.

```typescript
import { ROUTER_SERVICE } from '@owlmeans/router'
import type { RouterService } from '@owlmeans/router'

export const useProjectId = (ctx: AppContext): string | undefined => {
  const router = ctx.service<RouterService>(ROUTER_SERVICE)
  const { projectId } = router.useParams<{ projectId?: string }>()

  return projectId
}
```

### Switch an app to another plugin

The default browser plugin registers at priority 0. A plugin with a higher priority wins the
cascade without removing it:

```typescript
import { makeContext as makeBase } from '@owlmeans/web-panel'
import { appendReactRouter } from '@owlmeans/web-router-react-router'

export const makeContext = (cfg: AppConfig) => {
  const context = makeBase(cfg)
  appendReactRouter(context) // priority 100 — outranks the default OwlMeans router

  return context
}
```

### Author a plugin

Reach the host with `ensureRouterService` (it registers an empty host when none exists yet), set a
priority above `DEFAULT_ROUTER_PRIORITY` and a `match` that fires only in your environment. The
matcher can be reused as is — it is pure and SSR-safe.

```typescript
import { DEFAULT_ROUTER_PRIORITY, ensureRouterService, routeMatcherHelper } from '@owlmeans/router'
import type { LibraryRouter, RouterPlugin } from '@owlmeans/router'
import type { BasicConfig, BasicContext } from '@owlmeans/context'

export const makeSsrRouterPlugin = (): RouterPlugin => ({
  alias: 'ssr-router',
  priority: DEFAULT_ROUTER_PRIORITY + 50,
  mode: 'ssr',
  match: env => env.ssr,
  compile: routes => ({
    routes,
    branches: routeMatcherHelper.rankRouteBranches(routeMatcherHelper.flattenRoutes(routes)),
  }) as LibraryRouter,
  provider: () => SsrRouterProvider,
  outlet: () => SsrOutlet,
  useParams: useSsrParams,
  useLocation: useSsrLocation,
  useNavigate: useSsrNavigate,
  useSearchParams: useSsrSearchParams,
})

export const appendSsrRouter = <C extends BasicConfig, T extends BasicContext<C>>(ctx: T): T => {
  ensureRouterService(ctx).registerPlugin(makeSsrRouterPlugin())

  return ctx
}
```

### Match a pathname without a DOM

```typescript
import { routeMatcherHelper } from '@owlmeans/router'
import type { RouteObject } from '@owlmeans/router'

const routes: RouteObject[] = [
  { path: '/', children: [
    { index: true },
    { path: 'projects/:projectId', children: [{ index: true }, { path: 'stories/:storyId' }] },
  ] },
]

const branches = routeMatcherHelper.rankRouteBranches(routeMatcherHelper.flattenRoutes(routes))
const chain = routeMatcherHelper.matchRoutes(branches, '/projects/p1/stories/s7')
// chain: root → leaf RouteMatch[]; every level carries { projectId: 'p1', storyId: 's7' }
```

## API

### Functions and helpers

| Symbol | Purpose |
|---|---|
| `makeRouterService(alias?)` | Build an empty host (lazy service, default alias `ROUTER_SERVICE`) |
| `ensureRouterService(ctx)` | Return the host on a context, registering an empty one if missing |
| `defaultRouterEnv()` | `{ hasWindow, ssr: !hasWindow }` from the global `window` |
| `createRouteMatcherHelper()` / `routeMatcherHelper` | The matcher factory and its shared instance |
| `routeMatcherHelper.splitPath(path?)` | Non-empty `/`-separated parts |
| `routeMatcherHelper.segmentsOf(path?)` | Static / `:param` / splat pattern segments |
| `routeMatcherHelper.flattenRoutes(routes)` | Route tree → `RouteBranch[]` (each with its root→node chain) |
| `routeMatcherHelper.rankRouteBranches(branches)` | Most specific first, stable within equal score |
| `routeMatcherHelper.matchRoutes(branches, pathname)` | `RouteMatch[]` chain or `null`; static segments match case-insensitively, params are URI-decoded |

### `RouterService` members

| Member | Purpose |
|---|---|
| `registerPlugin(plugin)` | Add or replace (by alias) a plugin and re-sort by priority |
| `plugin(env?)` | The active plugin for `env` (default `defaultRouterEnv()`) |
| `outlet()`, `provider()` | Components of the active plugin |
| `useParams`, `useLocation`, `useNavigate`, `useSearchParams` | Hooks of the active plugin |
| `compile(routes)` | Compile a `RouteObject[]` into the active plugin's `LibraryRouter` |

### Constants

| Symbol | Value | Purpose |
|---|---|---|
| `ROUTER_SERVICE`, `DEFAULT_ALIAS` | `'router-service'` | Host alias |
| `DEFAULT_ROUTER_PRIORITY` | `0` | Priority of the default plugin |
| `ROUTER_PLUGIN` | `'router-plugin'` | Config-record id for declaring a preferred router plugin |

### Types

| Symbol | Purpose |
|---|---|
| `RouterService`, `RouterPlugin`, `RouterEnv` | Host, plugin contract, selection environment |
| `RouteObject`, `LibraryRouter`, `RouterProvider` | Route IR, opaque compiled router, the component rendering it |
| `RouteBranch`, `RouteMatch`, `PatternSegment`, `RouteParams` | Matcher output |
| `RouteMatcherHelper` | The matcher's interface |
| `UseParamsHook`, `UseLocationHook`, `UseNavigateHook`, `UseSearchParamsHook` | Hook signatures a plugin implements |
| `Location`, `Path`, `NavigateFunction`, `NavigateOptions`, `SetSearchParams` | Navigation value types |
| `ComponentType` | Re-exported from `react` |

## Common pitfalls

- Splat (`*`) and optional (`:x?`) segments are not implemented — `matchRoutes` throws on a splat
  branch. Keep route trees to static, `:param`, nested and index routes.
- Do not check `typeof window` inside a plugin's `match`; selection reads `RouterEnv`, which an SSR
  host overrides per request.
- Keep the facade methods assignable plain properties when extending the host — a native host
  replaces them by assignment.
- Keep the host lazy: plugin packages call `ensureRouterService` from `makeContext`, before the
  context is initialized, and an eager service would throw there.
- Registering a plugin under an existing alias replaces it; use a distinct alias to add a second
  mechanic.

## Related packages

- [`@owlmeans/web-router`](../web-router) — the default OwlMeans in-browser plugin (`appendWebRouter`)
- [`@owlmeans/web-router-react-router`](../web-router-react-router) — opt-in react-router v7 plugin (`appendReactRouter`)
- [`@owlmeans/client`](../client) — builds the `RouteObject` tree from entrypoints and exposes `context.router()`
- [`@owlmeans/client-route`](../client-route) — client-side route declarations
- [`@owlmeans/context`](../context) — the lazy service the host is built on

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
