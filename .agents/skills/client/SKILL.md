---
name: client
description: How to use @owlmeans/client — the platform-agnostic React client framework (web and native) — makeClientContext, App/Router, useNavigate/Navigator, useEntrypoint/RoutedComponent, useStoreModel/useStoreList, useValue, lazyComponent/lazyHandler code-splitting and chunk-failure recovery (retryImport, isChunkLoadError, recoverFromChunkError), the modal and debug services. Auto-invoked when importing client framework primitives, navigating between screens, or reading client state from React.
user-invocable: false
---

# @owlmeans/client

**Layer:** Client
**Install:** `"@owlmeans/client": "^0.1.18-rc.42"` in `dependencies`

The React substrate `@owlmeans/web-client` (browser) and the native equivalent are built on. A
cross-platform package imports from here; an application normally imports from the platform
package, which re-exports what it needs — **except the hooks below, which are only here**.

## What lives where

| Import from `@owlmeans/client` | Import from `@owlmeans/web-client` |
|---|---|
| `useNavigate`, `useEntrypoint`, `useStoreModel`, `useStoreList`, `useValue`, `useToggle`, `useSetupModalNavigator` — none of these are re-exported | `renderApp`, `makeContext`, `useAuthenticated`, and protocol binding helpers from `@owlmeans/client-entrypoint` |
| `RoutedComponent`, `EntrypointContextParams`, `Navigator`, `NavRequest`, `ClientContext` | `AppConfig`, `AppContext` |
| `App`, `Router`, `makeClientContext` — the platform-agnostic mounts | `WebApp`, `renderApp` — the browser mounts that wrap them |

## Key Exports

| Export | Description |
|--------|-------------|
| `makeClientContext(cfg)` | The React client context: `@owlmeans/client-context` plus the state resource, both config resources, the modal and debug services, the rerender hook and `context.router()` |
| `ClientContext<C>` | That context's interface — adds `router()`, `registerRerenderer(fn)`, `rerender()`, `modal()`, `debug()` |
| `App` / `AppProps` | Mount: provides the context and, unless `noRouter`, the router. `children` render inside the provider and before the router |
| `Context` / `ClientContextContainer` / `useContext()` | The React context container and the hook that reads it |
| `Router` / `RouterProps` / `RouterProvider` / `makeRouterModel()` | Route rendering. `provide` is optional — omitted, the active router plugin's `compile` is used |
| `useNavigate()` | The `Navigator` — programmatic navigation by entrypoint alias |
| `Navigator` / `NavRequest` | `navigate` `go` `press` `back` `pressBack` `location`; a request adds `replace` and `silent` to an `AbstractRequest` |
| `useEntrypoint<T>()` | The `EntrypointContextParams` of the screen currently rendering — `{ alias, path, params, context }` |
| `RoutedComponent<Extra>` | Type of a component bound to a frontend protocol |
| `handler(Component, preprender?)` | Wrap a React component as an entrypoint handler |
| `lazyComponent(load, exportName, opts?)` / `lazyHandler(load, exportName, opts?)` | A code-split component with a static `.preload()`; and `handler(lazyComponent(...))` with `.preload` carried through. Types `LazyComponent`, `LazyHandler`, `LazyComponentOptions`, `LazyErrorRenderer` — see Code-splitting |
| `retryImport(load, opts?)` / `isChunkLoadError(error)` | Run a dynamic `import()` again while it fails to FETCH; tell a fetch failure from a module that loaded and broke. `RetryImportOptions` — see Chunk failures |
| `reloadOnce(key, windowMs)` / `recoverFromChunkError()` | The guarded page reload, and the one every chunk-failure path in a tab shares — see Chunk failures |
| `useStoreModel` / `useStoreList` | React hooks over a `@owlmeans/state` resource — one record by id, or a live query |
| `useValue(loader, deps?, forceDefault?)` / `UseValueParams<T>` | Render an async result. The second argument is the **dependency list**, not a default — see Async values |
| `useToggle(opened?)` / `Toggleable` | An open/close/toggle handle, which is what a modal surface binds to |
| `appendModalService` / `createModalService` / `ModalService` / `ModalStackLayer` | The modal stack — `context.modal()`: `request` `response` `cancel` `error` `layer()` `link(toggle)` |
| `ModalBodyProps` / `useSetupModalNavigator()` | `{ modal?: ModalService }` — the props a modal body is rendered with; and the hook that lets a body navigate |
| `appendDebugService` / `createDebugService` / `appendStateDebug(ctx, alias)` / `DebugService` | The debug menu — `context.debug()` |
| `ClientError`, `ComponentError`, `ComponentPropError`, `ComponentPropUndefined` | The client error family, registered with `ResilientError` |
| `DEF_MODAL_ALIAS` (`modal`), `DEF_DEBUG_ALIAS` (`debug`), `DEBUGGER_FLAG` / `DEBUG_CONFIG_KEY` (`debugger`), `DEF_IMPORT_RETRY_ATTEMPTS` (2), `DEF_IMPORT_RETRY_DELAYS_MS` (500, 1500), `CHUNK_RELOAD_KEY` (`owlmeans:chunk-reload`), `CHUNK_RELOAD_WINDOW_MS` (60 s) | Constants |

## Subpath Exports

- `./utils` — `buildEntrypointTree`, `visitEntrypointTree`, `initializeRouter`, `createRouteRenderer`,
  `EntrypointContext`. What the router is assembled from; a package building its own routing surface
  uses these, an application does not.

## Navigation

Navigation addresses an ALIAS, never a URL — the path lives in the entrypoint declaration, so a
component never builds one. `useNavigate()` returns the `Navigator`, which asks the target
entrypoint for its `url(request)` and hands that to the active router plugin:

```typescript
import { useNavigate } from '@owlmeans/client'
import type { RoutedComponent } from '@owlmeans/client'

export const ProjectScreen: RoutedComponent = ({ params }) => {
  const nav = useNavigate()

  // `go` navigates; `press` returns the handler for an onClick. `params` fills the path
  // parameters of the target entrypoint, `query` the query string, `replace` swaps the
  // history entry instead of pushing one.
  void nav.go(PROJECT_ITEM, { params: { id: params.id }, query: { tab: 'files' } })

  return <a onClick={nav.press(PROJECT_LIST)}>Back to the list</a>
}
```

A URL that comes back starting with `http` belongs to another service, and the navigator assigns
`location.href` rather than pushing a history entry. `nav.navigate(entrypoint, request)` takes the
entrypoint itself when you already hold it; `nav.back()` / `nav.pressBack()` go one entry back, and
`nav.location()` reads the current one.

A bound screen receives `{ alias, path, params, context }` as props, and `useEntrypoint()`
reads the same values from anywhere below it — read path parameters from `params` and pass them
down; a nested component never resolves route parameters itself.

## Routing and guards

`App` mounts `Router`, which resolves the frontend entrypoints the context holds into a nested
route tree. Only entrypoints whose route is `AppType.Frontend` are mounted, and among those only
the ones that name no service at all, name this app's service, or are `sticky`. Each node
contributes **only its own segment** — its ancestors already carry theirs, so a declaration nests
by naming a `parent`.

A screen's guards are its own plus every ancestor's, taken from `getGuards()`. An empty list is an
open screen; when the list is non-empty and no guard matches, the renderer throws
`AuthorizationError('frontend-guard')`.

## Code-splitting a screen or component

`lazyComponent(load, exportName, opts?)` turns a dynamic `import()` into a component whose chunk
loads on first render, with the `Suspense` boundary INSIDE it — the fallback replaces only this
component and the layout around it stays mounted. `lazyHandler` is `handler(lazyComponent(...))`
with `.preload` carried through, so it binds exactly like `handler(Component)`. Both are
re-exported by `@owlmeans/web-client` and `@owlmeans/web-panel` next to `handler`; the
chunk-failure tools below by `@owlmeans/web-client`.

```tsx
import { lazyComponent, lazyHandler } from '@owlmeans/client'

// Module scope — never inside a render, a hook or an entrypoint handler factory.
export const reportsScreen = lazyHandler(
  () => import('./screens/reports.js'), 'ReportsScreen', { fallback: <Spinner /> }
)
const Chart = lazyComponent(() => import('./chart.js'), 'Chart', {
  fallback: props => <Skeleton height={props.height} />,
  error: (props, error, retry) => <ChartUnavailable onRetry={retry} />,
})

// Prefetch on intent: the screen then renders without its fallback.
<a onMouseEnter={() => void reportsScreen.preload()} onFocus={() => void reportsScreen.preload()}>
```

- **Module scope only.** The route renderer (`utils/route.tsx`) wraps the resolved screen in a
  fresh `memo(...)` on every render, so the route subtree remounts on each navigation. A lazy
  object made at module scope is already resolved by then and renders synchronously; one created
  during a render or inside a handler factory is a new `React.lazy` each time and re-suspends — the
  fallback flashes on every visit.
- **`preload()`** starts or joins the load and resolves to the component. Once loaded, every later
  render resolves in the same tick — no re-suspend.
- **`fallback`** is a node or `fallback(props)`. **`error`** is a node or a `LazyErrorRenderer`
  `(props, error, retry) => ReactNode`; `retry()` resets the piece's boundary and renders the
  recreated lazy, which loads the chunk again.
- **`retry`** — the load runs through `retryImport` by default; pass `RetryImportOptions` to tune
  it or `false` to load once.
- **An `exportName` the module does not export** rejects with a `SyntaxError` — never retried.

### Chunk failures

A lazy piece ALWAYS carries its own error boundary, so a failed chunk never unmounts what is around
it:

| The piece fails with | `error` given | `error` omitted |
|---|---|---|
| a chunk-load failure (`isChunkLoadError`), after `retryImport` gave up | with `reload` (default for `lazyHandler`): the guarded reload starts, `fallback` stays, and `error` renders once the guard refuses; without it: `error` renders in place | `recoverFromChunkError()` starts the guarded reload; `fallback` stays in place |
| anything else (a module that loaded and broke, its own render) | `error` renders in place | propagates to the nearest boundary above, as if the piece had none |

Give every piece a deliberate `error`: a leaf that has a plain rendering of the same content (a
formatter, a highlighter) degrades to it; anything else shows a notice with a retry. A whole screen
(`lazyHandler`) reloads once before its notice (`reload: true` by default) — it has nothing to
degrade to.

- **Retry scope.** `retryImport` covers a TRANSIENT fetch failure — a blip, an edge answering 404
  or 5xx for a moment. Chromium keeps a failed module fetch for the document's lifetime and rejects
  every later `import()` of that URL at once, so a retry imports the URL the error names with a
  fresh `t` parameter (`chunkUrlOf` + `cacheBustedUrl`, `bustCache` on by default; same-origin
  http(s) URLs only): a new URL, fetched again. That recovers a built chunk. It cannot recover a
  DEV-served module: React Fast Refresh makes every module import itself by its own URL, so the
  busted copy depends on the remembered failure — only a new document loads it, which is what
  `reload` and the guarded reload are for. Safari names no URL; its retries repeat `load`.
- **A failed load stays failed for the instance that saw it** until its `retry()`: React re-renders
  that instance while recovering from the error, and a fresh load there would suspend again
  forever. A NEW mount — a navigation back, another place in the tree — takes the recreated lazy and
  loads again; so does `preload()`.
- **`isChunkLoadError(error)`** is true for a browser's failed dynamic import (Chromium "Failed to
  fetch dynamically imported module", Safari "Importing a module script failed", Firefox "error
  loading dynamically imported module"), Vite's "Unable to preload CSS", webpack's `ChunkLoadError`,
  a `vite:preloadError` event, and an element's `error` event. It is false for a `SyntaxError`
  about a missing export and for a throw while the module evaluated — loading those again changes
  nothing.
- **`retryImport(load, opts?)`** runs `load` again while `shouldRetry(error)` (default
  `isChunkLoadError`) holds, `attempts` (2) more times at most, pausing `delaysMs[i]` before retry
  `i` (500 ms, 1500 ms; the last entry repeats), and rethrows the last failure.
- **`reloadOnce(key, windowMs)`** reloads the page at most once per `windowMs` per tab, keeping the
  time in `sessionStorage` under `key`; never while offline and never without storage (with no
  guard kept, a failure that survives the reload would reload forever); a platform with no page to
  reload does nothing. It answers whether a reload started.
- **`recoverFromChunkError()`** is `reloadOnce(CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS)` — the ONE
  guard a tab shares. An application that also reloads on `vite:preloadError` calls it rather than
  keeping a guard of its own, so one failure never reloads twice.

Source of truth: `src/lazy.tsx` and `src/lazy-retry.ts` in this package.

## Client state

State lives on the context as a `@owlmeans/state` resource; these hooks subscribe to it.

```typescript
import { useStoreList, useStoreModel } from '@owlmeans/client'

const task = useStoreModel<Task>(id, TASKS)                              // one record
const open = useStoreList<Task>({ query: { status: 'open' }, resource: TASKS })  // live query
```

`useStoreModel` returns a `StateModel` — read `model.record`, write with `model.update({ ... })`.
Never assign into `model.record` — it is not a snapshot. On a model the store backs, it IS the
object the store holds: a field assignment mutates what every other holder of that key reads, and
the next `update()`/`commit()` carries the mutation through, while nothing notifies and nothing
re-renders. The hook never throws for missing data either — an id the store knows nothing about
yields a model whose `empty` is true, and nothing is written into the store on the way.
`useStoreList` takes `{ query?, sort?, resource? }` and matches everything when `query` is omitted.
Full contract: [[state]].

Both hooks go through `useSyncExternalStore`, and the live subscription React installs is torn down
with the component. The FIRST snapshot is taken during render, by subscribing and unsubscribing
again in one statement — a state resource seeds its listener synchronously, so no render runs
without a value and that momentary subscription never outlives the call. The value is then cached
and the same reference is returned until something actually changes, which is what keeps React from
re-rendering forever.

## Async values

`useValue(loader, deps?, forceDefault?)` runs an async loader in an effect and answers with the
default — `null` when there is none — until it resolves. Its second argument is overloaded, and
reading it as "a default" is the standard mistake:

```typescript
useValue(async () => api.load(id), [id])                       // a DependencyList — re-runs on id
useValue(async () => api.load(id), { default: EMPTY, deps: [id] })   // both, via UseValueParams
useValue(async () => api.load(id))                             // no deps — the loader runs once
useValue(async () => api.count(), 0)                           // a bare non-array value IS the default
```

The deps always come from the argument's SHAPE: an array is the dependency list itself, an object
with a `deps` key gives `deps ?? []`, and anything else gives `[]`. The default is read from the
same argument: `default` off a `UseValueParams` object, `null` when an array was passed, the value
itself otherwise. `forceDefault: true` changes only the second half — the argument is then taken as
the default whatever its shape, while still deciding the deps.

The loader is handed a `MutableRefObject<boolean>` cancel ref, which the effect's cleanup sets to
`true`, so a loader that awaits more than once checks `cancel.current` before it commits. A loader that resolves to a **function** is kept aside and returned as it is, rather than
being run as a state updater — which is what lets a component be an async value.

## Modals

`context.modal()` owns a STACK of body components and one surface. The surface is a component the
app mounts once: it links a toggle to the service, reads the top layer through `layer()`, and
renders it with the service as a prop.

```tsx
import { useContext, useSetupModalNavigator, useToggle, useValue } from '@owlmeans/client'
import type { ModalBodyProps } from '@owlmeans/client'
import { useEffect } from 'react'
import type { FC } from 'react'

export const Modal: FC = () => {
  useSetupModalNavigator()                     // lets a body navigate; call it once
  const context = useContext()
  const toggle = useToggle(false)

  useEffect(() => {
    void context.waitForInitialized().then(() => context.modal().link(toggle))
  }, [])

  const Com = useValue<FC<ModalBodyProps> | undefined>(
    async () => toggle.opened ? context.modal().layer()?.Com : undefined,
    [toggle.opened]
  )

  return <Dialog open={toggle.opened} onOpenChange={toggle.set}>
    {Com != null ? <Com modal={context.modal()} /> : undefined}
  </Dialog>
}
```

A **body is an `FC<ModalBodyProps>`** — it receives the service as an optional `modal` prop, and
that prop is how it answers. Nothing else reaches it, so whatever a body needs travels in the
closure of the component that requested it.

```typescript
const result = await context.modal().request<Answer>(ConfirmBody)   // null when cancelled
```

`request` pushes the body onto the stack, opens the linked toggle, and resolves when the body calls
`modal.response(value)`, `modal.cancel()` (which resolves `null`) or `modal.error(e)` (which
rejects). All three settle the promise first, then pop the layer and close the surface — and
`request` pops a SECOND time when its own `await` resumes. One completed request therefore removes
two layers.

**Keep the stack one deep.** A lone body ends on an empty stack and the second pop costs nothing.
A body requested from inside another body takes its parent down with it: closing the child pops the
child, sees a layer still there and schedules the surface to reopen 500 ms later, and then the
child's continuation pops the parent in the microtask before that timer fires. The surface reopens
with `layer()` answering `undefined` and nothing to render, and the parent's own `request` — whose
deferred no one is left to settle — never resolves. Chain from the caller instead: await the first
request, then issue the next.

## Debug menu

`appendDebugService` registers the menu only when `cfg.debug.all` or `cfg.debug.debugger` is set,
so `context.debug()` answers `undefined` in a normal build and a caller must handle that. A package
that owns a client resource calls `appendStateDebug(context, alias)` at wiring time to have it
listed under "Reset states"; "Reset app" erases the whole client DB.

## Depends On

- `@owlmeans/client-context`, `@owlmeans/client-entrypoint`, `@owlmeans/client-resource`
- `@owlmeans/router` (the routing plugin surface), `@owlmeans/state`, `@owlmeans/entrypoint`,
  `@owlmeans/resource`, `@owlmeans/config`, `@owlmeans/context`, `@owlmeans/auth`, `@owlmeans/error`
- `react` and `@remix-run/router` (peer)

## Related

- [[web-client]] — the browser layer built on this
- [[state]] — the store the two state hooks read
- [[router]] — the routing plugin `context.router()` resolves
