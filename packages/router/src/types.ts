import type { InitializedService, BasicContext } from "@owlmeans/context"
import type { ComponentType } from 'react'
export type { ComponentType }

export type LibraryRouter = unknown

/**
 * Neutral route intermediate representation. Shape-compatible with react-router's
 * `RouteObject` so that `createBrowserRouter` accepts it directly AND the OwlMeans
 * matcher can consume the very same objects.
 */
export interface RouteObject {
  index?: boolean
  path?: string
  children?: RouteObject[]
  Component?: ComponentType
}

export type RouterProvider = ComponentType<any>

/**
 * Environment descriptor used by the cascade to select a routing plugin.
 * Pre-designed for SSR: an SSR plugin selects on `ssr`/`request`; the browser
 * plugin is the universal fallback in the browser.
 */
export interface RouterEnv {
  hasWindow: boolean
  ssr: boolean
  request?: unknown
}

/**
 * A pluggable routing mechanic. Multiple plugins may be registered on a single
 * router service; the active one is chosen by cascade (priority + `match`).
 */
export interface RouterPlugin {
  alias: string
  /** Higher wins among matching plugins. Defaults to 0. */
  priority?: number
  /** Free-form tag, e.g. 'browser' | 'ssr' | 'memory'. */
  mode?: string
  /** Selector; `undefined` means "always applicable". */
  match?: (env: RouterEnv, ctx?: BasicContext<any>) => boolean
  /** Compile the neutral route IR into a plugin-specific library router. */
  compile: (routes: RouteObject[], ctx?: BasicContext<any>) => LibraryRouter | Promise<LibraryRouter>
  provider: () => RouterProvider
  outlet: () => ComponentType
  useParams: UseParamsHook
  useLocation: UseLocationHook
  useNavigate: UseNavigateHook
  useSearchParams: UseSearchParamsHook
}

export interface RouterService extends InitializedService {
  registerPlugin: (plugin: RouterPlugin) => void
  /** Select the active plugin for the given (or default) environment. */
  plugin: (env?: RouterEnv) => RouterPlugin
  // Facade — every method delegates to the active plugin.
  // NOTE: these remain plain writable instance properties so that alternative
  // implementations (e.g. the native router) can monkey-patch them directly.
  outlet: () => ComponentType
  provider: () => RouterProvider
  useParams: UseParamsHook
  useLocation: UseLocationHook
  useNavigate: UseNavigateHook
  useSearchParams: UseSearchParamsHook
  compile: (routes: RouteObject[]) => LibraryRouter | Promise<LibraryRouter>
}

export type RouteParams = Record<string, string | undefined>

export interface UseParamsHook {
  <T extends RouteParams = RouteParams>(): T
}

export interface Path {
  pathname: string
  search: string
  hash: string
}

export interface Location<State = any> extends Path {
  state: State

  key: string
}

export interface UseLocationHook {
  (): Location
}

export interface NavigateOptions {
  replace?: boolean
  state?: any
  preventScrollReset?: boolean
  relative?: "route" | "path"
  flushSync?: boolean
  viewTransition?: boolean
}

export interface NavigateFunction {
  (to: string | Partial<Path>, options?: NavigateOptions): void | Promise<void>
  (delta: number): void | Promise<void>
}

export interface UseNavigateHook {
  (): NavigateFunction
}

export interface SetSearchParams {
  (
    next: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams),
    options?: { replace?: boolean; state?: any }
  ): void
}

export interface UseSearchParamsHook {
  (init?: URLSearchParams | Record<string, string>): [URLSearchParams, SetSearchParams]
}
