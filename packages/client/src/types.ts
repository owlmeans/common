import type { PropsWithChildren, FC, DependencyList } from 'react'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { ClientConfig, ClientContext as BasicClientContext } from '@owlmeans/client-context'
import type { StateResourceAppend } from '@owlmeans/state'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import type { DebugServiceAppend, ModalServiceAppend } from './components/types.js'
import type { ConfigResourceAppend } from '@owlmeans/config'
import type { ConfigRecord } from '@owlmeans/context'
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

export interface RoutedComponent<ExtraProps = {}> extends FC<PropsWithChildren<ModuleContextParams & ExtraProps>> {
}

export interface ModuleContextParams<T extends {} = {}> {
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

export interface Navigator {
  _navigate: NavigateFunction
  navigate: <R extends NavRequest = NavRequest>(module: ClientEntrypoint<string, AbstractRequest>, request?: R) => Promise<void>
  go: <R extends NavRequest = NavRequest>(alias: string, request?: R) => Promise<void>
  back: () => Promise<void>
  pressBack: () => () => void
  press: <R extends NavRequest = NavRequest>(alias: string, request?: R) => () => void
  location: <R extends NavRequest = NavRequest>() => Location<R>
}

export interface DebugConfigRecord extends ConfigRecord {
  states?: string[]
}

export interface UseValueParams<T> {
  default?: T
  deps?: DependencyList
}
