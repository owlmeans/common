import type { Route, RouteModel } from './types.js'
import type { CreateRouteSignature } from './utils/types.js'
import { resolve } from './utils/route.js'
import { AppType } from '@owlmeans/context'

export const makeRouteModel = (route: Route): RouteModel => {
  const model: RouteModel = {
    route,
    resolve: resolve(route)
  }

  return model
}

export const createRoute: CreateRouteSignature<Route> = (alias, path, opts?) => {
  const route: Route = {
    alias,
    type: AppType.Backend,
    path,
    resolved: false,
    ...(typeof opts === 'string' ? { parent: opts } : opts)
  }

  return route
}
