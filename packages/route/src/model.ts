import type { Route, RouteModel, ServiceRoute } from './types.js'
import { isServiceRoute, isServiceRouteResolved } from './utils/service.js'
import type { CreateRouteSignature } from './utils/types.js'
import { getParentRoute } from './utils/route.js'
import { normalizePath } from './helper.js'
import { SEP } from './consts.js'
import { AppType } from '@owlmeans/context'

export const makeRouteModel = (route: Route): RouteModel => {
  const model: RouteModel = {
    route,
    resolve: async context => {
      if (route.resolved) return route
      route.resolved = true

      if (context.cfg.services == null) {
        throw new SyntaxError('Services aren\'t configured to resolve routes')
      }
      const service = context.cfg.services[route.service ?? context.cfg.service]
      if (!isServiceRoute(service)) {
        throw new SyntaxError('Service is not a valid service route')
      }
      if (!isServiceRouteResolved(service)) {
        throw new SyntaxError('Service route is not resolved')
      }
      const fields = ['host', 'port', 'service', 'base'] as (keyof Route & keyof ServiceRoute)[]
      fields.forEach(key => (route[key] as any) = service[key])

      const parent = await getParentRoute(context, route)
      if (parent != null) {
        route.path = normalizePath(parent.path) + SEP + normalizePath(route.path)
      }

      return route
    }
  }

  return model
}

export const createRoute: CreateRouteSignature<Route> = (alias, path, opts?) => {
  const route: Route = {
    alias,
    type: AppType.Backend,
    path,
    resolved: false,
    ...(typeof opts === 'string' ? { paren: opts } : opts)
  }

  return route
}
