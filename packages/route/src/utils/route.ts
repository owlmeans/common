import type { Context, Contextual } from '@owlmeans/context'
import type { Route, RouteModel } from '../types.js'
import { isServiceRoute, isServiceRouteResolved } from './service.js'
import { normalizePath } from '../helper.js'
import { SEP } from '../consts.js'

export const getParentRoute = async (context: Context, route: Route): Promise<Route | null> => {
  if (route.parent != null) {
    const parent = context.module<Contextual & { _module: true, route: RouteModel }>(route.parent)
    assertCycle(context, route, parent.route.route)
    if (parent.route == null) {
      throw new SyntaxError('Parent module doesn\'t provide a route')
    }
    await parent.route.resolve(context)

    return parent.route.route
  }

  return null
}

export const overrideParams = (route: Route, overrides?: Partial<Route>, filter?: string[]) => {
  Object.entries(overrides ?? {}).forEach(([key, value]) => {
    if (route[key as keyof Route] == null
      && (filter == null || filter.includes(key))) {
      (route[key as keyof Route] as Route[keyof Route]) = value
    }
  })
}

export const resolve = (route: Route) => async <C extends Context>(context: C) => {
  if (route.resolved) return route
  route.resolved = true

  if (context.cfg.services == null) {
    throw new SyntaxError('Services aren\'t configured to resolve routes')
  }

  const service = context.cfg.services[route.service ?? context.cfg.service]
  if (!isServiceRoute(service)) {
    throw new SyntaxError('Service is not a valid service route')
  }
  if (!service.resolved && service.host != null) {
    service.resolved = true
  }
  if (!isServiceRouteResolved(service)) {
    throw new SyntaxError('Service route is not resolved')
  }


  overrideParams(route, service, ['host', 'port', 'service', 'base'])

  const parent = await getParentRoute(context, route)
  if (parent != null) {
    route.path = (parent.path.startsWith(SEP) ? SEP : '')
      + normalizePath(parent.path) + SEP + normalizePath(route.path)
  }

  console.log(`Route resolves: ${route.alias} to ${route.path}`)

  return route
}

/**
 * @throws {SyntaxError}
 */
const assertCycle = (context: Context, route: Route, parent: Route) => {
  while (parent.parent != null) {
    if (parent.parent === route.alias) {
      throw new SyntaxError(`Route parentship cycle detected. Parent: ${parent.alias} has his child as ancestor ${route.alias}`)
    }
    parent = context.module<Contextual & { _module: true, route: RouteModel }>(parent.parent).route.route
  }
}
