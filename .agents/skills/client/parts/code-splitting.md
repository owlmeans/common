---
name: code-splitting
description: lazyComponent and lazyHandler code-splitting at module scope, preload, fallbacks and error renderers, and chunk-failure recovery with lazyRetryHelper.
metadata:
  purposes: screen, layout
  mentions: lazyComponent, lazyHandler, lazyRetryHelper, retryImport, isChunkLoadError, recoverFromChunkError, reloadOnce, LazyErrorRenderer, CHUNK_RELOAD_KEY, vite:preloadError
---

# @owlmeans/client — Code-splitting

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
- **`retry`** — the load runs through `lazyRetryHelper.retryImport` by default; pass `RetryImportOptions` to tune
  it or `false` to load once.
- **An `exportName` the module does not export** rejects with a `SyntaxError` — never retried.

### Chunk failures

A lazy piece ALWAYS carries its own error boundary, so a failed chunk never unmounts what is around
it:

| The piece fails with | `error` given | `error` omitted |
|---|---|---|
| a chunk-load failure (`lazyRetryHelper.isChunkLoadError`), after `retryImport` gave up | with `reload` (default for `lazyHandler`): the guarded reload starts, `fallback` stays, and `error` renders once the guard refuses; without it: `error` renders in place | `lazyRetryHelper.recoverFromChunkError()` starts the guarded reload; `fallback` stays in place |
| anything else (a module that loaded and broke, its own render) | `error` renders in place | propagates to the nearest boundary above, as if the piece had none |

Give every piece a deliberate `error`: a leaf that has a plain rendering of the same content (a
formatter, a highlighter) degrades to it; anything else shows a notice with a retry. A whole screen
(`lazyHandler`) reloads once before its notice (`reload: true` by default) — it has nothing to
degrade to.

- **Retry scope.** `lazyRetryHelper.retryImport` covers a TRANSIENT fetch failure — a blip, an edge answering 404
  or 5xx for a moment. Chromium keeps a failed module fetch for the document's lifetime and rejects
  every later `import()` of that URL at once, so a retry imports the URL the error names with a
  fresh `t` parameter (`lazyRetryHelper.chunkUrlOf` + `.cacheBustedUrl`, `bustCache` on by default; same-origin
  http(s) URLs only): a new URL, fetched again. That recovers a built chunk. It cannot recover a
  DEV-served module: React Fast Refresh makes every module import itself by its own URL, so the
  busted copy depends on the remembered failure — only a new document loads it, which is what
  `reload` and the guarded reload are for. Safari names no URL; its retries repeat `load`.
- **A failed load stays failed for the instance that saw it** until its `retry()`: React re-renders
  that instance while recovering from the error, and a fresh load there would suspend again
  forever. A NEW mount — a navigation back, another place in the tree — takes the recreated lazy and
  loads again; so does `preload()`.
- **`lazyRetryHelper.isChunkLoadError(error)`** is true for a browser's failed dynamic import (Chromium "Failed to
  fetch dynamically imported module", Safari "Importing a module script failed", Firefox "error
  loading dynamically imported module"), Vite's "Unable to preload CSS", webpack's `ChunkLoadError`,
  a `vite:preloadError` event, and an element's `error` event. It is false for a `SyntaxError`
  about a missing export and for a throw while the module evaluated — loading those again changes
  nothing.
- **`lazyRetryHelper.retryImport(load, opts?)`** runs `load` again while `shouldRetry(error)` (default
  `isChunkLoadError`) holds, `attempts` (2) more times at most, pausing `delaysMs[i]` before retry
  `i` (500 ms, 1500 ms; the last entry repeats), and rethrows the last failure.
- **`lazyRetryHelper.reloadOnce(key, windowMs)`** reloads the page at most once per `windowMs` per tab, keeping the
  time in `sessionStorage` under `key`; never while offline and never without storage (with no
  guard kept, a failure that survives the reload would reload forever); a platform with no page to
  reload does nothing. It answers whether a reload started.
- **`lazyRetryHelper.recoverFromChunkError()`** is `reloadOnce(CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS)` — the ONE
  guard a tab shares. An application that also reloads on `vite:preloadError` calls it rather than
  keeping a guard of its own, so one failure never reloads twice.

Source of truth: `src/lazy.tsx` and `src/lazy-retry.ts` in this package.
