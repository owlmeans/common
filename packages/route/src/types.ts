import type { AppType } from '@owlmeans/context'
import type { RouteMethod } from './consts'

export interface Route {
  type: AppType
  alias: string
  path: string
  method?: RouteMethod
  service?: string
  host?: string
  port?: number
  base?: string
}

export interface ServiceRoute {
  type: AppType
  service: string
  host?: string
  port?: number
  base?: string
}

export interface RouteModel {
  route: Route
}
