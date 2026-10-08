# @owlmeans/web-router

The default OwlMeans in-browser routing plugin: standard URL routing over the browser History API,
a pure route matcher from `@owlmeans/router`, and a React provider, outlet and hooks — with no
third-party router. It registers itself as a `RouterPlugin` on the `@owlmeans/router` host, and
`@owlmeans/web-client` / `@owlmeans/web-panel` call `appendWebRouter` in their `makeContext`, so a
web app gets it without importing anything. An app imports it directly only for a custom context
setup or to reach the plugin's components and hooks outside the `context.router()` facade. To route
with react-router instead, add `@owlmeans/web-router-react-router` (higher priority, wins the
cascade); an SSR or React Native host is a plugin of its own.

## Installation

```bash
bun add @owlmeans/web-router@^0.1.18-rc.50
```

`react` is a peer dependency.

## Concepts

- **Router host** — the `RouterService` of `@owlmeans/router`, registered once per context
  (`ensureRouterService`). Its facade (`provider`, `outlet`, `compile`, `useParams`, `useLocation`,
  `useNavigate`, `useSearchParams`) delegates to the active plugin.
- **Browser plugin** — `makeBrowserRouterPlugin()`: alias `BROWSER_ROUTER`, priority 0, mode
  `'browser'`, `match` always true — the universal browser fallback any higher-priority plugin
  outranks.
- **Compile** — `compile(routes)` flattens and ranks the neutral `RouteObject[]`
  (`{ index?, path?, children?, Component? }`) into matchable branches; synchronous.
- **Route chain** — `BrowserRouterProvider` re-matches on every history change and renders the chain
  through `RouteChain`; each `<Outlet/>` renders the next-deeper match. A match without a
  `Component` is a pass-through, as in react-router's implicit outlet.
- **Route syntax** — static segments, `:param`, nested routes and index routes; a static segment
  outranks a `:param` sibling. No splat or optional segments.

## Usage

### Default wiring

Nothing to do with `@owlmeans/web-client` or `@owlmeans/web-panel`. A context assembled by hand
registers the plugin itself:

```typescript
import { appendWebRouter } from '@owlmeans/web-router'

appendWebRouter(context)   // ensures the router host, then registers the browser plugin
```

### Read the route in a component

Inside an OwlMeans app, reach the hooks through the facade so the active plugin answers:

```tsx
import { useContext } from '@owlmeans/client'

export const UserScreen = () => {
  const context = useContext()
  const { id } = context.router().useParams<{ id: string }>()
  const [query] = context.router().useSearchParams()
  const navigate = context.router().useNavigate()

  return (
    <button onClick={() => navigate(`/users/${id}/edit`, { state: { from: query.get('tab') } })}>
      edit
    </button>
  )
}
```

`navigate(to, { replace?, state? })` takes a path string, a `{ pathname?, search?, hash? }`
object, or a number for history steps; an absolute `http…` string is a full-page navigation.
The setter returned by `useSearchParams` (`set(next, { replace?, state? })`) rewrites the search part
of the current path.

### Use the plugin standalone

The same components and hooks are exported directly — what the package's own browser harness does:

```tsx
import { createRoot } from 'react-dom/client'
import type { RouteObject } from '@owlmeans/router'
import { makeBrowserRouterPlugin, Outlet, useParams } from '@owlmeans/web-router'

const Layout = () => <main><Outlet /></main>
const Home = () => <p>home</p>
const User = () => <p>user {useParams().id}</p>

const routes: RouteObject[] = [
  { path: '', Component: Layout, children: [
    { index: true, Component: Home },
    { path: 'users', children: [{ path: ':id', Component: User }] },   // component-less group passes through
  ] },
]

const plugin = makeBrowserRouterPlugin()
const Provider = plugin.provider()
createRoot(document.getElementById('root')!).render(<Provider router={plugin.compile(routes)} />)
```

### Switch to react-router

```typescript
import { appendReactRouter } from '@owlmeans/web-router-react-router'

appendReactRouter(context)   // priority 100 outranks the browser plugin
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `appendWebRouter(ctx)` | function | `ensureRouterService(ctx)` + register the browser plugin; returns the context |
| `makeWebRouterService()` | function | back-compat: a new router host pre-loaded with the browser plugin |
| `makeBrowserRouterPlugin()` | function | the `RouterPlugin` itself |
| `BROWSER_ROUTER` | const | `'owlmeans-browser-router'` — the plugin alias |
| `BrowserRouterProvider` | component | `{ router: LibraryRouter }` — subscribes to history and renders the match chain |
| `Outlet` | component | renders the next-deeper match |
| `RouteChain` | component | `{ depth }` — renders the chain from a depth, skipping component-less matches |
| `useParams`, `useLocation`, `useNavigate`, `useSearchParams` | hooks | the plugin's hooks; throw outside the provider |
| `createBrowserHistory()` | function | `BrowserHistory` over `window.history` + `popstate`; an inert stub without `window` |
| `OwlLibraryRouter` | type | `{ routes, branches }` — what `compile` returns |
| `RouterState` | type | `{ location, matches, navigate }` — the provider's React context value |
| `BrowserHistory` | type | `location`, `push`, `replace`, `go`, `listen` |

## Common pitfalls

- A hook used outside `BrowserRouterProvider` throws
  `owlmeans-browser-router: router hook used outside of the router provider`.
- Calling the plugin's hooks directly bypasses the cascade; in an app, use `context.router().…` so a
  switched plugin keeps working.
- Splat (`*`) and optional segments are not supported; declare explicit routes.
- `makeWebRouterService()` builds a separate host; prefer `appendWebRouter`, which reuses the
  context's host.
- `noRouter` works on `<App>` only — `<PanelApp>` accepts the prop by type but still mounts the
  router.

## Related packages

- [`@owlmeans/router`](../router) — the router host, `RouterPlugin` contract and pure matcher
- [`@owlmeans/web-router-react-router`](../web-router-react-router) — opt-in react-router v7 plugin
- [`@owlmeans/client`](../client) — builds `RouteObject[]` from the entrypoint tree and exposes `context.router()`
- [`@owlmeans/web-client`](../web-client) — calls `appendWebRouter` inside `makeContext`
- [`@owlmeans/web-panel`](../web-panel) — the panel layer, wired the same way

The `web-router` skill describes this plugin; the `router-plugins` skill covers the plugin contract,
cascade selection and authoring a new plugin.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.51
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
