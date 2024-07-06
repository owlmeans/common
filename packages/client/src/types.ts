import type { RouteObject } from 'react-router'
import type { makeContext } from '@owlmeans/context'
import type { Router as RemixRouter } from '@remix-run/router'
import type { PropsWithChildren, FC } from 'react'
import type { AbstractRequest } from '@owlmeans/module'

export type ContextType = ReturnType<typeof makeContext>

export interface RouterModel {
  routes: RouteObject[]
  resolve: (context: ContextType) => Promise<RouteObject[]>
}

export interface RouterProvider {
  (routes: RouteObject[]): RemixRouter
}

export interface RouterProps {
  provide: RouterProvider
}

export interface AppProps extends PropsWithChildren {
  context: ContextType
  provide?: RouterProvider
}

export interface RoutedComponent<ExtraPropse = {}> extends FC<PropsWithChildren<ModuleContextParams & ExtraPropse>> {
}

export interface ModuleContextParams {
  alias: string
  params: AbstractRequest['params']
  path: string
  context: ContextType
}
