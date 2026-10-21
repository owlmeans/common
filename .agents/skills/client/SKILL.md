---
name: client
description: How to use @owlmeans/client — the platform-agnostic React client framework (web and native) — makeClientContext, App/Router, useNavigate/Navigator, useEntrypoint/RoutedComponent, useStoreModel/useStoreList, useValue, lazyComponent/lazyHandler code-splitting and chunk-failure recovery (lazyRetryHelper), the modal and debug services. Auto-invoked when importing client framework primitives, navigating between screens, or reading client state from React.
user-invocable: false
---

# @owlmeans/client

**Layer:** Client
**Install:** `"@owlmeans/client": "^0.1.18-rc.57"` in `dependencies`

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
| `lazyComponent(load, exportName, opts?)` / `lazyHandler(load, exportName, opts?)` | A code-split component with a static `.preload()`; and `handler(lazyComponent(...))` with `.preload` carried through. Types `LazyComponent`, `LazyHandler`, `LazyComponentOptions`, `LazyErrorRenderer` — see [parts/code-splitting.md](parts/code-splitting.md) |
| `lazyRetryHelper.retryImport(load, opts?)` / `lazyRetryHelper.isChunkLoadError(error)` | Run a dynamic `import()` again while it fails to FETCH; tell a fetch failure from a module that loaded and broke. `RetryImportOptions` — see *Chunk failures* in [parts/code-splitting.md](parts/code-splitting.md) |
| `lazyRetryHelper.reloadOnce(key, windowMs)` / `lazyRetryHelper.recoverFromChunkError()` | The guarded page reload, and the one every chunk-failure path in a tab shares — see *Chunk failures* in [parts/code-splitting.md](parts/code-splitting.md) |
| `useStoreModel` / `useStoreList` | React hooks over a `@owlmeans/state` resource — one record by id, or a live query |
| `useValue(loader, deps?, forceDefault?)` / `UseValueParams<T>` | Render an async result. The second argument is the **dependency list**, not a default — see Async values |
| `useToggle(opened?)` / `Toggleable` | An open/close/toggle handle, which is what a modal surface binds to |
| `appendModalService` / `createModalService` / `ModalService` / `ModalStackLayer` | The modal stack — `context.modal()`: `request` `response` `cancel` `error` `layer()` `link(toggle)` |
| `ModalBodyProps` / `useSetupModalNavigator()` | `{ modal?: ModalService }` — the props a modal body is rendered with; and the hook that lets a body navigate |
| `appendDebugService` / `createDebugService` / `appendStateDebug(ctx, alias)` / `DebugService` | The debug menu — `context.debug()` |
| `ClientError`, `ComponentError`, `ComponentPropError`, `ComponentPropUndefined` | The client error family, registered with `ResilientError` |
| `DEF_MODAL_ALIAS` (`modal`), `DEF_DEBUG_ALIAS` (`debug`), `DEBUGGER_FLAG` / `DEBUG_CONFIG_KEY` (`debugger`), `DEF_IMPORT_RETRY_ATTEMPTS` (2), `DEF_IMPORT_RETRY_DELAYS_MS` (500, 1500), `CHUNK_RELOAD_KEY` (`owlmeans:chunk-reload`), `CHUNK_RELOAD_WINDOW_MS` (60 s) | Constants |

## Subpath Exports

- `./utils` — `clientRouterOf(ctx)` (`buildEntrypointTree`, `visitEntrypointTree`, `initializeRouter`), `createRouteRenderer`,
  `EntrypointContext`. What the router is assembled from; a package building its own routing surface
  uses these, an application does not.

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

## Parts

Load a part on top of this core when its job is in play.

| Part | Load it when |
|---|---|
| [navigation](parts/navigation.md) | Navigating between screens (`useNavigate`, `Navigator`), reading route params (`useEntrypoint`), or how `Router` mounts entrypoints and checks guards |
| [code-splitting](parts/code-splitting.md) | Code-splitting a screen or component (`lazyComponent`, `lazyHandler`) or recovering from chunk-load failures (`lazyRetryHelper`) |
| [modals](parts/modals.md) | Building the modal surface or a modal body (`context.modal()`, `ModalBodyProps`, `request`/`response`) |
