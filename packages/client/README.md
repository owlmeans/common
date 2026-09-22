# @owlmeans/client

The platform-agnostic React client framework that [`@owlmeans/web-client`](../web-client) (browser)
and the native client are built on. It provides the client context factory, the `App`/`Router`
mounts, alias-free navigation, the screen hooks (`useEntrypoint`, `useStoreModel`, `useStoreList`,
`useValue`, `useToggle`), and the modal and debug services. A browser application normally builds
its context with `makeContext` from [`@owlmeans/web-panel`](../web-panel) and mounts it with
`renderApp` from `@owlmeans/web-client`. `@owlmeans/web-client` does not re-export the hooks
listed here. `web-panel` re-exports `useNavigate`, `useValue` and `useEntrypoint`, while
`useStoreModel` and `useStoreList` are available only from this package. A cross-platform package
imports everything from here. Server code never uses this package; its equivalent is
[`@owlmeans/server-context`](../server-context).

## Installation

```bash
bun add @owlmeans/client@^0.1.18-rc.36
```

`react` and `@remix-run/router` are peer dependencies.

## Concepts

- **Client context**: `makeClientContext(cfg)` builds on `@owlmeans/client-context` and adds the
  default state resource, the config and plugin resources, the modal and debug services, the
  rerender hook and `context.router()`. Platform factories (`web-client`, `web-panel`) compose it,
  and an app's own `makeContext` composes theirs.
- **Screen**: a frontend entrypoint protocol (`route(alias, path, frontend(...))`) bound to a
  component with `bindScreen(protocol, handler(Component))`. The router mounts only frontend
  entrypoints, and each nests under its `parent`.
- **Routed component**: a `RoutedComponent` receives `{ alias, path, params, context }`, and
  `useEntrypoint()` reads the same values anywhere below it.
- **Navigator**: `useNavigate()` addresses entrypoints, not URLs. The target entrypoint builds its
  own `url(request)`, and the active router plugin performs the navigation.
- **Store hooks**: `useStoreModel` and `useStoreList` subscribe to a [`@owlmeans/state`](../state)
  resource through `useSyncExternalStore`. `useValue` renders an async result.
- **Modal stack**: `context.modal().request(Body)` pushes a body onto a stack rendered by a surface
  the app mounts once, and resolves when the body answers.

## Usage

### Declare screens, bind them, mount the app

Screen protocols are declared in the shared `common` package and bound in the web app:

```ts
// common: entrypoints.ts
import { openProtocol } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { frontend, route } from '@owlmeans/route'

const projectBase = openProtocol(route('app:project', '/project/:projectId', frontend()), { guards: DEFAULT_GUARD })

export const appScreens = {
  project: {
    base: projectBase,
    dashboard: openProtocol(route('app:project:dashboard', '/dashboard', frontend({ parent: projectBase }))),
    settings: openProtocol(route('app:project:settings', '/settings', frontend({ parent: projectBase }))),
  },
} as const
```

```tsx
// web: entrypoints.ts and main.tsx
import { bindAll, bindScreen, handler, renderApp } from '@owlmeans/web-client'

export const entrypoints = [
  ...bindAll({ project: appProtocols.project }),                    // backend calls
  bindScreen(appScreens.project.base, handler(ProjectLayout)),
  bindScreen(appScreens.project.dashboard, handler(DashboardScreen)),
  bindScreen(appScreens.project.settings, handler(SettingsScreen)),
]

const context = makeContext(config)                               // the app's single factory
context.registerEntrypoints(entrypoints)
renderApp(context, undefined, <ModalSurface />)                   // children render before the router
```

Outside the browser (a native shell, a test harness) the platform-agnostic mount is
`<App context={context} />`. `noRouter` skips the router, and `provide` overrides how routes are
compiled.

### A routed screen that loads, stores and renders

```tsx
import { useEntrypoint, useStoreModel, useValue } from '@owlmeans/client'
import type { RoutedComponent } from '@owlmeans/client'

export const DashboardScreen: RoutedComponent = () => {
  const context = useContext()                                    // the app's typed wrapper
  const { params } = useEntrypoint<{ projectId?: string }>()
  const projectId = params.projectId

  // Load once per id, write the answer into the store, render from the store.
  useValue(async cancel => {
    if (projectId == null) {
      return null
    }
    const project = await context.entrypoint(appProtocols.project.get).call({ params: { id: projectId } })
    if (cancel?.current !== true) {
      await context.getStateResource(PROJECTS).save(project)
    }

    return project
  }, [projectId])

  const project = useStoreModel<Project>(projectId, PROJECTS)
  if (project.empty) {
    return <Spinner />
  }

  return <ProjectBoard project={project.record} onRename={title => project.update({ title })} />
}
```

The app's `useContext` is typically `() => useBasicContext<Config, Context>()` over the one exported
here (or re-exported by `web-panel`), so app-level accessors are typed.

### Navigate by protocol

```tsx
import { useNavigate } from '@owlmeans/client'

export const ProjectTabs: FC<{ projectId: string }> = ({ projectId }) => {
  const nav = useNavigate()

  return <nav>
    <button onClick={nav.press(appScreens.project.dashboard, { params: { projectId } })}>Dashboard</button>
    <button onClick={nav.press(appScreens.project.settings, { params: { projectId }, query: { tab: 'members' } })}>
      Members
    </button>
    <button onClick={nav.pressBack()}>Back</button>
  </nav>
}

// imperatively, replacing the history entry
await nav.go(appScreens.project.dashboard, { params: { projectId }, replace: true })
```

A URL that resolves to another service (`http…`) is assigned to `location.href` instead of being
pushed onto the history.

### A modal request

```tsx
import type { ModalBodyProps } from '@owlmeans/client'
import { createElement } from 'react'

const ConfirmDelete: FC<ModalBodyProps & { storyId: string }> = ({ modal, storyId }) =>
  <Dialog.Body>
    <Button onClick={() => modal?.response(true)}>Delete {storyId}</Button>
    <Button onClick={() => modal?.cancel()}>Cancel</Button>
  </Dialog.Body>

const onDelete = async () => {
  const confirmed = await context.modal().request<boolean>(
    ({ modal }) => createElement(ConfirmDelete, { modal, storyId })
  )
  if (confirmed === true) {                                     // null when cancelled
    await context.entrypoint(appProtocols.story.delete).call({ params: { id: storyId } })
  }
}
```

The surface is mounted once. It calls `useSetupModalNavigator()`, links a `useToggle()` to
`context.modal().link(toggle)` after `waitForInitialized()`, and renders
`context.modal().layer()?.Com` with `modal={context.modal()}`.

## API

### Context and mounting

| Symbol | Kind | Purpose |
|---|---|---|
| `makeClientContext<C, T>(cfg)` | function | Build the React client context (state, config/plugin resources, modal, debug, router accessor) |
| `ClientContext<C>` | type | Adds `router()`, `registerRerenderer(fn)`, `rerender()`, `modal()`, `debug()`, `getStateResource` |
| `App` / `AppProps` | component / type | Provide the context and, unless `noRouter`, mount the router; `children` render first |
| `Context`, `ClientContextContainer` | React context | The provider and the container behind it |
| `useContext<C, T>()` | hook | Read the current client context |
| `Router` / `RouterProps` | component / type | Resolve frontend entrypoints into routes; `provide` is optional |
| `makeRouterModel()`, `RouterModel`, `RouterProvider` | function / type | The route model and the router-provider signature |
| `handler(Component, preprender?)` | function | Wrap a component as an entrypoint handler for `bindScreen` |

### Screens and navigation

| Symbol | Kind | Purpose |
|---|---|---|
| `RoutedComponent<Extra>` | type | A component bound to a frontend protocol |
| `EntrypointContextParams<T>` | type | `{ alias, params, path, context }` |
| `useEntrypoint<T>()` | hook | The params of the screen currently rendering |
| `useNavigate()` | hook | The `Navigator` |
| `Navigator` | type | `navigate(entrypoint, req?)`, `go(target, req?)`, `press(target, req?)`, `back()`, `pressBack()`, `location()` |
| `NavRequest<T>` | type | A partial `AbstractRequest` plus `replace` and `silent` |
| `EntrypointTarget` | type | `EntrypointReference \| string`; application code passes protocol objects |

### State and values

| Symbol | Kind | Purpose |
|---|---|---|
| `useStoreModel<T>(id?, alias?)` | hook | One record from a state resource, live; never throws for missing data |
| `useStoreList<T>(opts?)` | hook | A live query `{ query?, sort?, resource? }` returning `StateModel<T>[]` |
| `UseStoreListOptions<T>` | type | The `useStoreList` options |
| `useValue<T>(loader, deps?, forceDefault?)` | hook | Render an async result; `null` (or the default) until it resolves |
| `UseValueParams<T>` | type | `{ default?, deps? }` |
| `useToggle(opened?)`, `Toggleable` | hook / type | `{ opened, open, close, set, toggle }` |

### Modal and debug services

| Symbol | Kind | Purpose |
|---|---|---|
| `appendModalService(ctx, alias?)`, `createModalService(alias?)` | function | Register or create the modal stack (`context.modal()`) |
| `ModalService`, `ModalStackLayer`, `ModalBodyProps`, `ModalServiceAppend` | type | `request`, `response`, `cancel`, `error`, `layer`, `link`, `stack`, `toggle` |
| `useSetupModalNavigator()` | hook | Give modal bodies a navigator; call once in the surface |
| `appendDebugService(ctx, alias?)`, `createDebugService(alias?)` | function | The debug menu, registered only when `cfg.debug.all` or `cfg.debug.debugger` is set |
| `appendStateDebug(ctx, alias)` | function | List a client resource under "Reset states" in the debug menu |
| `DebugService`, `DebugMenuItem`, `DebugServiceAppend`, `DebugConfigRecord` | type | Debug menu contracts; `context.debug()` may be `undefined` |

### Errors and constants

| Symbol | Kind | Purpose |
|---|---|---|
| `ClientError`, `ComponentError`, `ComponentPropError`, `ComponentPropUndefined` | class | The client error family, registered with `ResilientError` |
| `DEF_MODAL_ALIAS`, `DEF_DEBUG_ALIAS` | const | `'modal'`, `'debug'` |
| `DEBUGGER_FLAG`, `DEBUG_CONFIG_KEY` | const | `'debugger'` |

### Subpath `@owlmeans/client/utils`

| Symbol | Kind | Purpose |
|---|---|---|
| `buildEntrypointTree`, `visitEntrypointTree`, `EntrypointTreeVisitor` | function / type | Build and walk the frontend entrypoint tree |
| `initializeRouter(context)` | function | Initialize the router for a context |
| `createRouteRenderer`, `HandledRenderer` | function / type | Render one route with guards applied |
| `EntrypointContext` | React context | What `useEntrypoint` reads |

These are the pieces the router is assembled from. A package building its own routing surface
uses them; an application does not.

## Common pitfalls

- **Building URLs or passing alias strings in components.** Navigate with protocol objects
  (`nav.go(protocol, { params })`) and let the entrypoint build the URL.
- **Resolving route params in nested components.** Read `params` from the screen props or
  `useEntrypoint()` and pass them down.
- **Reading `useValue`'s second argument as a default.** An array is the dependency list, and an
  object uses `{ default, deps }`. A bare non-array value is the default and gives no deps.
- **Committing after unmount in a multi-await loader.** Check `cancel.current` before writing.
- **Assigning into `model.record`.** Nothing re-renders. Use `model.update({ ... })`.
- **Importing `useNavigate`, `useEntrypoint`, `useStoreModel`, `useStoreList` or `useValue` from
  `@owlmeans/web-client`.** It does not re-export them; import them from this package.
- **Requesting a modal from inside another modal body.** Closing the child also pops the parent,
  and the parent's request never resolves. Await the first request, then issue the next.
- **Mounting global overlays inside a route.** They are torn down on every navigation. Pass them
  as `App`/`renderApp` children.
- **Assuming `context.debug()` exists.** It is `undefined` unless the debug flags are set.
- **A screen whose guards all fail.** The renderer throws `AuthorizationError('frontend-guard')`, so
  bind a login flow for guarded screens.

## Related packages

- [`@owlmeans/web-client`](../web-client): the browser layer (`renderApp`, `WebApp`, `makeContext`)
- [`@owlmeans/web-panel`](../web-panel): the shadcn UI context factory and navigation shell most web apps start from
- [`@owlmeans/state`](../state): the store `useStoreModel` / `useStoreList` read
- [`@owlmeans/client-entrypoint`](../client-entrypoint): `bind`, `bindAll`, `bindScreen`, typed `call`/`invoke`/`url`
- [`@owlmeans/client-context`](../client-context): the base client context and config
- [`@owlmeans/router`](../router): the router plugin `context.router()` resolves
- [`@owlmeans/route`](../route): `route()` and `frontend()` for screen declarations

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.33
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
