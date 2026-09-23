import { lazy, Suspense, Component } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { handler } from './helper.js'
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
 * was already preloaded never shows its fallback. A rejected load is never cached: the internal
 * `React.lazy` is recreated so the next attempt (e.g. after a network blip) retries for real.
 */
export const lazyComponent = <M, K extends ComponentExport<M>>(
  load: () => Promise<M>, exportName: K, opts?: LazyComponentOptions
): LazyComponent<ExportProps<M, K>> => {
  let loaded: Loaded | undefined
  let loading: Promise<Loaded> | undefined

  const runLoad = (): Promise<Loaded> => loading ??= load().then(module => {
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
    // Read at render time, so a render after a failed load uses the recreated lazy and retries.
    const Current = current
    const fallback = typeof opts?.fallback === 'function' ? opts.fallback(props) : opts?.fallback
    const element = <Suspense fallback={fallback ?? null}><Current {...props} /></Suspense>

    return opts?.error !== undefined
      ? <LazyErrorBoundary fallback={opts.error} props={props}>{element}</LazyErrorBoundary>
      : element
  }
  Lazy.displayName = `Lazy(${exportName})`

  return Object.assign(Lazy, { preload }) as unknown as LazyComponent<ExportProps<M, K>>
}

interface LazyErrorBoundaryProps {
  fallback: LazyComponentOptions['error']
  props: Record<string, unknown>
  children: ReactNode
}

interface LazyErrorBoundaryState {
  failed: boolean
  error: unknown
}

class LazyErrorBoundary extends Component<LazyErrorBoundaryProps, LazyErrorBoundaryState> {
  override state: LazyErrorBoundaryState = { failed: false, error: undefined }

  static getDerivedStateFromError(error: unknown): LazyErrorBoundaryState {
    return { failed: true, error }
  }

  override render() {
    if (this.state.failed) {
      const { fallback, props } = this.props
      return typeof fallback === 'function' ? fallback(props, this.state.error) : fallback
    }
    return this.props.children
  }
}

/**
 * `handler(lazyComponent(...))`, carrying `.preload()` through — bind it to a screen exactly like
 * `handler(Component)`. The same module-scope rule applies: call it where the entrypoints are
 * declared, never inside a render.
 */
export const lazyHandler = <M, K extends ComponentExport<M>>(
  load: () => Promise<M>, exportName: K, opts?: LazyComponentOptions
): LazyHandler<ExportProps<M, K>> => {
  const LazyComp = lazyComponent(load, exportName, opts)
  const refed = handler(LazyComp as unknown as HandledRenderer<{}>)

  return Object.assign(refed, { preload: LazyComp.preload }) as unknown as LazyHandler<ExportProps<M, K>>
}
