import type { AppType, BasicContext, BasicConfig } from '@owlmeans/context'
import type { RouteProtocols, RouteMethod } from './consts'

export interface CommonRoute extends BasicRoute {
  alias: string
  path: string
  parent?: string
  default?: boolean
  method?: RouteMethod
}

export interface CommonServiceRoute extends BasicRoute {
  service: string
  default?: boolean
}

export interface BasicRoute {
  type: AppType
  service?: string
  host?: string
  port?: number
  base?: string
  resolved: boolean
  protocol?: RouteProtocols
  secure?: boolean
}

export interface ResolvedServiceRoute extends CommonServiceRoute {
  host: string
  resolved: true
}

export interface CommonRouteModel {
  route: CommonRoute
  resolve: <C extends BasicConfig, T extends BasicContext<C>>(context: T) => Promise<CommonRoute>
}

export interface RouteOptions extends Partial<CommonRoute> {
}
