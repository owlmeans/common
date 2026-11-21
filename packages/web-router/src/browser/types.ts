import type { Location, NavigateFunction, RouteMatch, RouteObject, RouteBranch } from '@owlmeans/router'

/** The compiled library router produced by the browser plugin's `compile`. */
export interface OwlLibraryRouter {
  routes: RouteObject[]
  branches: RouteBranch[]
  /**
   * The application's own base (`cfg.services[cfg.service].base`, normalized): `''` at the root,
   * `/admin` when the host serves the application under `/admin`. Routes and every location the
   * router hands out stay base-less; the history adds it on push/replace and strips it on read.
   */
  basename?: string
}

/** Value carried by the router state React context. */
export interface RouterState {
  location: Location
  matches: RouteMatch[]
  navigate: NavigateFunction
}

export interface BrowserHistory {
  readonly location: Location
  push: (to: string, state?: any) => void
  replace: (to: string, state?: any) => void
  go: (delta: number) => void
  listen: (callback: (location: Location) => void) => () => void
}
