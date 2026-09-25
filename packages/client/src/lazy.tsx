import { lazy, Suspense, Component, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { handler } from './helper.js'
import { isChunkLoadError, recoverFromChunkError, retryImport } from './lazy-retry.js'
import type { HandledRenderer } from './utils/route.js'
import type {
  ComponentExport, ExportProps, LazyComponent, LazyComponentOptions, LazyHandler
} from './types.js'

type Loaded = ComponentType<any>
type LazyModule = { default: Loaded }

/**
 * Wrap an async module import as a stable lazily-loaded component with a `.preload()`.
 *
 * MUST be called at module scope, never inside a render, a hook body or an entrypoint handler
 * factory — the OwlMeans route renderer (`utils/route.tsx`) remounts the whole route subtree on
 * every navigation (a fresh component identity per render), so a lazy object created during
 * render would re-suspend on every navigation instead of rendering instantly once loaded.
 *
 * The `Suspense` boundary sits inside the returned component, so the fallback replaces only this
 * component — the layout around it stays mounted while the chunk loads.
 *
 * Once loaded, later renders resolve synchronously (no re-suspend), so a component whose chunk
 * was already preloaded never shows its fallback. A load that fails to fetch is retried in place
 * (`retryImport`, tuned or turned off by `opts.retry`); one that still fails is never cached: the
 * internal `React.lazy` is recreated, so the next mount, `retry()` or `preload()` loads for real.
 *
 * The component always carries its own error boundary, so a chunk that failed for good never
 * unmounts what is around it: `opts.error` renders in its place, or — without one — the guarded
 * reload (`recoverFromChunkError`) starts and the fallback stays. Any other error without
 * `opts.error` goes on to the nearest boundary above, as if there were none.
 */
export const lazyComponent = <M, K extends ComponentExport<M>>(
  load: () => Promise<M>, exportName: K, opts?: LazyComponentOptions
): LazyComponent<ExportProps<M, K>> => {
  let loaded: Loaded | undefined
  let loading: Promise<Loaded> | undefined

  const fetchModule = (): Promise<M> => opts?.retry === false ? load() : retryImport(load, opts?.retry)

  const runLoad = (): Promise<Loaded> => loading ??= fetchModule().then(module => {
    const Comp = (module as unknown as Record<string, Loaded | undefined>)[exportName]
    if (Comp == null) {
      throw new SyntaxError(`Lazy module has no component export "${exportName}"`)
    }
    return loaded = Comp
  }).catch((error: unknown) => {
    loading = undefined
    current = createLazy()
    throw error
  })

  const preload = (): Promise<Loaded> => loaded != null ? Promise.resolve(loaded) : runLoad()

  const createLazy = () => lazy<Loaded>(() => {
    const ready = loaded
    if (ready != null) {
      // Already resolved: hand React a thenable that settles synchronously, so its lazy
      // initializer reads the module in the same tick and never suspends.
      const settled = { then: (resolve: (module: LazyModule) => void) => resolve({ default: ready }) }
      return settled as unknown as Promise<LazyModule>
    }
    return runLoad().then(Comp => ({ default: Comp }))
  })

  let current = createLazy()

  const Lazy = (props: Record<string, unknown>) => {
    // The lazy THIS instance renders, taken when it mounts: a failed load stays failed for it
    // while React re-renders it to recover from the error, until `retry` swaps in the recreated
    // lazy. A new mount — a navigation back, another place — takes the recreated one at once.
    const [Current, setCurrent] = useState(() => current)
    const fallback = (typeof opts?.fallback === 'function' ? opts.fallback(props) : opts?.fallback) ?? null

    return <LazyErrorBoundary error={opts?.error} reload={opts?.reload === true} fallback={fallback} props={props}
      onRetry={() => setCurrent(() => current)}>
      <Suspense fallback={fallback}><Current {...props} /></Suspense>
    </LazyErrorBoundary>
  }
  Lazy.displayName = `Lazy(${exportName})`

  return Object.assign(Lazy, { preload }) as unknown as LazyComponent<ExportProps<M, K>>
}

interface LazyErrorBoundaryProps {
  error: LazyComponentOptions['error']
  /** Start the guarded reload for a chunk failure even though `error` is given. */
  reload: boolean
  fallback: ReactNode
  props: Record<string, unknown>
  /** Swap the failed lazy for the recreated one — batched with the boundary's own reset. */
  onRetry: () => void
  children: ReactNode
}

interface LazyErrorBoundaryState {
  failed: boolean
  error: unknown
  /** A guarded reload has started: keep the fallback up until the new document replaces this one. */
  reloading?: boolean
}

class LazyErrorBoundary extends Component<LazyErrorBoundaryProps, LazyErrorBoundaryState> {
  override state: LazyErrorBoundaryState = { failed: false, error: undefined }

  static getDerivedStateFromError(error: unknown): LazyErrorBoundaryState {
    return { failed: true, error }
  }

  override componentDidCatch(error: unknown): void {
    // A chunk that failed for good is recovered by a new document: always without a surface of its
    // own, and with one when asked (`reload`) — a whole screen rather than a piece that degrades.
    // The reload is guarded (once a minute per tab); when the guard refuses, the surface stays.
    if (isChunkLoadError(error) && (this.props.error === undefined || this.props.reload)) {
      if (recoverFromChunkError()) {
        this.setState({ reloading: true })
      }
    }
  }

  /** Render the children again, over the recreated lazy, which loads anew. */
  readonly retry = (): void => {
    this.setState({ failed: false, error: undefined, reloading: false })
    this.props.onRetry()
  }

  override render() {
    if (!this.state.failed) {
      return this.props.children
    }
    const { error, fallback, props } = this.props
    if (this.state.reloading === true) {
      return fallback
    }
    if (error !== undefined) {
      return typeof error === 'function' ? error(props, this.state.error, this.retry) : error
    }
    if (isChunkLoadError(this.state.error)) {
      return fallback
    }
    // Not a chunk failure and no surface for it: the application's own boundary decides.
    throw this.state.error
  }
}

/**
 * `handler(lazyComponent(...))`, carrying `.preload()` through — bind it to a screen exactly like
 * `handler(Component)`. The same module-scope rule applies: call it where the entrypoints are
 * declared, never inside a render. A screen whose chunk still fails after its retries starts the
 * guarded reload before showing its `error` (`reload` defaults to `true` here): a whole screen has
 * nothing to degrade to, and in a dev-served app only a new document can load it again.
 */
export const lazyHandler = <M, K extends ComponentExport<M>>(
  load: () => Promise<M>, exportName: K, opts?: LazyComponentOptions
): LazyHandler<ExportProps<M, K>> => {
  const LazyComp = lazyComponent(load, exportName, { ...opts, reload: opts?.reload ?? true })
  const refed = handler(LazyComp as unknown as HandledRenderer<{}>)

  return Object.assign(refed, { preload: LazyComp.preload }) as unknown as LazyHandler<ExportProps<M, K>>
}
