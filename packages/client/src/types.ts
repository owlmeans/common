import type { PropsWithChildren, FC, DependencyList, ComponentType, ReactNode } from 'react'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { ClientConfig, ClientContext as BasicClientContext } from '@owlmeans/client-context'
import type { Criteria, ResourceRecord, Sort } from '@owlmeans/resource'
import type { StateResourceAppend } from '@owlmeans/state'
import type { ClientEntrypoint, RefedEntrypointHandler } from '@owlmeans/client-entrypoint'
import type { DebugServiceAppend, ModalServiceAppend } from './components/types.js'
import type { ConfigResourceAppend } from '@owlmeans/config'
import type { ConfigRecord, EntrypointReference } from '@owlmeans/context'
import type { NavigateFunction, RouterService, Location, RouteObject, LibraryRouter } from '@owlmeans/router'


export interface RouterModel {
  routes: RouteObject[]
  resolve: <C extends ClientConfig, T extends ClientContext<C>>(context: T) => Promise<RouteObject[]>
}

export interface RouterProvider {
  (routes: RouteObject[]): LibraryRouter | Promise<LibraryRouter>
}

export interface RouterProps {
  /**
   * How to turn the resolved route IR into a library router. When omitted, the
   * active router plugin's `compile` (via `context.router().compile`) is used —
   * the default OwlMeans routing path. A function receives the routes; a value is
   * treated as an already-built library router.
   */
  provide?: RouterProvider | LibraryRouter
}

export interface AppProps extends PropsWithChildren {
  context: ClientContext<any>
  provide?: RouterProvider | LibraryRouter
  /** Opt out of mounting the router (e.g. when routing is hosted elsewhere). */
  noRouter?: boolean
}

export interface RoutedComponent<ExtraProps = {}> extends FC<PropsWithChildren<EntrypointContextParams & ExtraProps>> {
}

export interface EntrypointContextParams<T extends {} = {}> {
  alias: string
  params: AbstractRequest<T>['params']
  path: string
  context: ClientContext
}

export interface ClientContext<C extends ClientConfig = ClientConfig> extends BasicClientContext<C>,
  ConfigResourceAppend,
  StateResourceAppend,
  ModalServiceAppend,
  DebugServiceAppend {
  registerRerenderer: (listener: CallableFunction) => () => void
  rerender: () => void
  router: () => RouterService
}

export interface NavRequest<T extends Record<string, any> = Record<string, any>>
  extends Partial<AbstractRequest<T>> {
  replace?: boolean
  silent?: boolean
}

/** A navigation target is a protocol reference in application code, with strings retained for adapters. */
export type EntrypointTarget = EntrypointReference | string

export interface Navigator {
  _navigate: NavigateFunction
  navigate: <R extends NavRequest = NavRequest>(module: ClientEntrypoint<string, AbstractRequest>, request?: R) => Promise<void>
  go: <R extends NavRequest = NavRequest>(target: EntrypointTarget, request?: R) => Promise<void>
  back: () => Promise<void>
  pressBack: () => () => void
  press: <R extends NavRequest = NavRequest>(target: EntrypointTarget, request?: R) => () => void
  location: <R extends NavRequest = NavRequest>() => Location<R>
}

export interface DebugConfigRecord extends ConfigRecord {
  states?: string[]
}

export interface UseValueParams<T> {
  default?: T
  deps?: DependencyList
}

/** What `useStoreList` subscribes to. Every field is optional; nothing at all means everything. */
export interface UseStoreListOptions<T extends ResourceRecord = ResourceRecord> {
  /** The live query. Omitted or `{}` matches every record the resource holds. */
  query?: Criteria<T>
  sort?: Sort<T>[]
  /** Which state resource to read; the context's default one when omitted. */
  resource?: string
}

/** How `retryImport` retries a rejected dynamic import. */
export interface RetryImportOptions {
  /** Loads after the first failure, at most; `0` loads once. Default 2. */
  attempts?: number
  /** The pause before each retry, in order; the last one repeats. Default 500 ms, then 1500 ms. */
  delaysMs?: readonly number[]
  /**
   * Which rejections are retried. Default `isChunkLoadError` — a module that could not be fetched,
   * never one that was fetched and then failed.
   */
  shouldRetry?: (error: unknown) => boolean
  /**
   * Retry a failed chunk from its own URL with a cache-busting `t` parameter when the browser's
   * error names it (Chromium, Firefox). Default `true`: a browser that remembers a failed module
   * fetch rejects every later `import()` of the same URL at once, so only a new URL is fetched
   * again. `false` repeats `load` as is.
   */
  bustCache?: boolean
  /** How a cache-busted URL is imported; a seam for tests. Default: a dynamic `import()`. */
  importUrl?: (url: string) => Promise<unknown>
}

/**
 * What a lazily-loaded piece renders once it failed: the props it was given, the error, and
 * `retry`, which resets the piece's boundary so its chunk loads again.
 */
export type LazyErrorRenderer = (props: any, error: unknown, retry: () => void) => ReactNode

/** How a lazily-loaded component behaves while its chunk loads and when the load fails. */
export interface LazyComponentOptions {
  /** Shown while the chunk loads: a node, or a function of the props the component was given. */
  fallback?: ReactNode | ((props: any) => ReactNode)
  /**
   * Rendered in place of the component when its chunk fails to load, or it throws: a node, or a
   * `LazyErrorRenderer`. Omitted, a chunk failure starts the guarded reload
   * (`recoverFromChunkError`) and leaves `fallback` in place, and any other error propagates to
   * the nearest boundary above.
   */
  error?: ReactNode | LazyErrorRenderer
  /**
   * How a rejected load is retried before it counts as failed — `retryImport`'s options, its
   * defaults when omitted. `false` loads once.
   */
  retry?: false | RetryImportOptions
  /**
   * When a chunk still fails after its retries, start the guarded page reload
   * (`recoverFromChunkError`, once a minute per tab) before showing `error`; the fallback stays up
   * while the reload starts, and `error` shows when the guard refuses. Without `error` a chunk
   * failure always reloads. Default `false` for `lazyComponent` (a piece degrades in place), `true`
   * for `lazyHandler` (a whole screen). A dev-served app needs it: its modules import themselves by
   * their own URL (React Fast Refresh), so a browser that remembers the failed fetch can load that
   * module again only in a new document.
   */
  reload?: boolean
}

export interface LazyPreload<P = {}> {
  /** Start (or join) the chunk load; resolves to the component once it is ready. */
  preload: () => Promise<ComponentType<P>>
}

/** A lazily-loaded component: renders like the real one, and can be preloaded ahead of use. */
export type LazyComponent<P = {}> = ComponentType<P> & LazyPreload<P>

/** An entrypoint handler over a lazily-loaded component, carrying its `.preload()`. */
export type LazyHandler<P = {}> = RefedEntrypointHandler<P> & LazyPreload<P>

/** Names of a module's exports that are React components. */
export type ComponentExport<M> = {
  [K in keyof M]-?: M[K] extends ComponentType<any> ? K : never
}[keyof M] & string

/** The props of a module's component export. */
export type ExportProps<M, K extends keyof M> = M[K] extends ComponentType<infer P> ? P : never
