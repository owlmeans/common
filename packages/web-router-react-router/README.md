# @owlmeans/web-router-react-router

React Router as an opt-in OwlMeans routing plugin. `@owlmeans/router` is a plugin host that picks
the active `RouterPlugin` by priority cascade; `@owlmeans/web-client` and `@owlmeans/web-panel`
register the default OwlMeans in-browser plugin (`@owlmeans/web-router`, priority 0). This package
registers a react-router plugin at priority 100, so one `appendReactRouter(context)` call in an app's
`makeContext` switches that app's routing to `createBrowserRouter` with react-router's provider,
outlet and hooks — route and entrypoint declarations stay unchanged. Use it only when an app
specifically needs react-router (an existing react-router codebase, a library that expects its
context); otherwise keep the default plugin and do not install this package. Server-side rendering
or React Native routing is a plugin of its own, not this one. The `web-router-react-router` skill
covers this package; the `router-plugins` skill covers the plugin model.

## Installation

```bash
bun add @owlmeans/web-router-react-router@^0.1.18-rc.32 react-router
```

Peer dependencies: `react` and `react-router@^8.4.0`.

## Concepts

- **Router host** — the `RouterService` from `@owlmeans/router`, registered on the context as
  `router-service` and reached through `context.router()`. Its facade (`compile`, `provider`,
  `outlet`, `useParams`, `useLocation`, `useNavigate`, `useSearchParams`) delegates to the active
  plugin.
- **Cascade** — plugins are sorted by `priority` (higher first); the first whose `match(env)` is
  truthy wins. This plugin's `match` always returns `true`, so at priority 100 it wins over the
  default browser plugin in every environment.
- **Alias** — the plugin registers as `'react-router'` (`REACT_ROUTER`); registering the same alias
  again replaces it, so calling `appendReactRouter` twice is harmless.
- **Neutral routes** — the `RouteObject` tree produced from entrypoints uses react-router-compatible
  paths, so both plugins consume the same tree.

## Usage

### 1. Switch an app to react-router

Call it after the layer context factory, which has already registered the default plugin.

```typescript
import { makeContext as makePanelContext } from '@owlmeans/web-panel'
import type { AppConfig, AppContext } from '@owlmeans/web-panel'
import { appendReactRouter } from '@owlmeans/web-router-react-router'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makePanelContext<C, T>(cfg)
  appendReactRouter<C, T>(context)   // priority 100 beats the default plugin's 0

  return context
}
```

`<App>` and `<PanelApp>` need no `provide` prop: without it they compile routes through the active
plugin (`context.router().compile`).

### 2. Use the hooks through the facade

Application code keeps using the OwlMeans facade, not react-router imports, so switching the plugin
back needs no code changes.

```tsx
import { useContext } from '@owlmeans/client'

export const ProjectHeader = () => {
  const context = useContext()
  const { projectId } = context.router().useParams<{ projectId: string }>()
  const [search] = context.router().useSearchParams()

  return <h1>{projectId} — {search.get('tab') ?? 'overview'}</h1>
}
```

### 3. Register the plugin object directly

`makeReactRouterPlugin()` returns the plugin for a host you manage yourself — a custom router
service, or a test that wants a fixed plugin.

```typescript
import { ensureRouterService } from '@owlmeans/router'
import { makeReactRouterPlugin, REACT_ROUTER } from '@owlmeans/web-router-react-router'

const router = ensureRouterService(context)
router.registerPlugin(makeReactRouterPlugin())
router.plugin().alias === REACT_ROUTER   // true
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `appendReactRouter(ctx)` | function | `ensureRouterService(ctx).registerPlugin(makeReactRouterPlugin())`; returns the same context |
| `makeReactRouterPlugin()` | function → `RouterPlugin` | The plugin object (below) |
| `REACT_ROUTER` | const | `'react-router'` — the plugin alias |
| `REACT_ROUTER_PRIORITY` | const | `100` — above the default plugin's `0` |

### The plugin

| Member | Value |
|---|---|
| `alias` / `priority` / `mode` | `'react-router'` / `100` / `'browser'` |
| `match` | `() => true` |
| `compile(routes)` | `createBrowserRouter(routes)` |
| `provider()` / `outlet()` | react-router's `RouterProvider` / `Outlet` |
| `useParams`, `useLocation`, `useNavigate`, `useSearchParams` | react-router's hooks of the same name |

## Common pitfalls

- Calling `appendReactRouter` before the layer factory is harmless for the cascade (priority decides,
  not order), but it must run on the same context the app renders.
- The plugin is browser-only (`createBrowserRouter`, `match` always true). An SSR or native
  environment needs its own plugin at a higher priority with an environment-specific `match`.
- Importing react-router hooks directly in application code ties it to this plugin; go through
  `context.router()` or `@owlmeans/client`'s `useNavigate` instead.
- `react-router` is a peer dependency — install it in the app, matching `^8.4.0`.

## Related packages

- [`@owlmeans/router`](../router) — the plugin host, `RouterPlugin` contract and `ensureRouterService`
- [`@owlmeans/web-router`](../web-router) — the default OwlMeans in-browser plugin (priority 0)
- [`@owlmeans/web-client`](../web-client) — registers the default plugin and renders `<App>`
- [`@owlmeans/web-panel`](../web-panel) — the panel layer factory and `<PanelApp>`
- [`@owlmeans/client`](../client) — `useContext` and the entrypoint-aware `useNavigate`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.49
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
