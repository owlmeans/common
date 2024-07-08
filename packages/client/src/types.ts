import type { RouteObject } from 'react-router'
import type { Router as RemixRouter } from '@remix-run/router'
import type { PropsWithChildren, FC } from 'react'
import type { AbstractRequest } from '@owlmeans/module'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export interface RouterModel {
  routes: RouteObject[]
  resolve: <C extends Config, T extends Context<C>>(context: T) => Promise<RouteObject[]>
}

export interface RouterProvider {
  (routes: RouteObject[]): RemixRouter
}

export interface RouterProps {
  provide: RouterProvider
}

export interface AppProps extends PropsWithChildren {
  context: Context<any>
  provide?: RouterProvider
}

export interface RoutedComponent<ExtraPropse = {}> extends FC<PropsWithChildren<ModuleContextParams & ExtraPropse>> {
}

export interface ModuleContextParams {
  alias: string
  params: AbstractRequest['params']
  path: string
  context: Context
}
