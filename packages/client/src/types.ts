import type { RouteObject, Location } from 'react-router'
import type { Router as RemixRouter } from '@remix-run/router'
import type { PropsWithChildren, FC } from 'react'
import type { AbstractRequest } from '@owlmeans/module'
import type { ClientConfig, ClientContext as BasicClientContext } from '@owlmeans/client-context'
import type { StateResourceAppend } from '@owlmeans/state'
import type { ClientModule } from '@owlmeans/client-module'

export interface RouterModel {
  routes: RouteObject[]
  resolve: <C extends ClientConfig, T extends ClientContext<C>>(context: T) => Promise<RouteObject[]>
}

export interface RouterProvider {
  (routes: RouteObject[]): RemixRouter | Promise<RemixRouter>
}

export interface RouterProps {
  provide: RouterProvider | RemixRouter
}

export interface AppProps extends PropsWithChildren {
  context: ClientContext<any>
  provide?: RouterProvider | RemixRouter
}

export interface RoutedComponent<ExtraPropse = {}> extends FC<PropsWithChildren<ModuleContextParams & ExtraPropse>> {
}

export interface ModuleContextParams {
  alias: string
  params: AbstractRequest['params']
  path: string
  context: ClientContext
}

export interface ClientContext<C extends ClientConfig = ClientConfig> extends BasicClientContext<C>, StateResourceAppend {
}

export interface NavRequest<T extends Record<string, any> = Record<string, any>>
  extends Partial<AbstractRequest<T>> {
  replace?: boolean
  silent?: boolean
}

export interface Navigator {
  navigate: <R extends NavRequest = NavRequest>(module: ClientModule<string, AbstractRequest>, request?: R) => Promise<void>
  go: <R extends NavRequest = NavRequest>(alias: string, request?: R) => Promise<void>
  press: <R extends NavRequest = NavRequest>(alias: string, request?: R) => () => void
  location: <R extends NavRequest = NavRequest>() => Location<R>
}
