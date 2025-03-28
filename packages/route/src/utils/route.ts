import type { BasicConfig, BasicContext, Contextual } from '@owlmeans/context'
import type { CommonRoute, CommonRouteModel, CommonServiceRoute } from '../types.js'
import { isServiceRoute, isServiceRouteResolved } from './service.js'
import { normalizePath } from '../helper.js'
import { SEP } from '../consts.js'

type Config = BasicConfig

export const getParentRoute = async <C extends Config, T extends BasicContext<C>>(context: T, route: CommonRoute): Promise<CommonRoute | null> => {
  if (route.parent != null) {
    const parent = context.module<Contextual & { _module: true, route: CommonRouteModel, resolve?: () => Promise<void> }>(route.parent)
    assertCycle<C, T>(context, route, parent.route.route)
    if (parent.route == null) {
      throw new SyntaxError('Parent module doesn\'t provide a route')
    }
    if (!parent.route.route.resolved) {
      if (parent.resolve != null) {
        await parent.resolve()
      } else {
        return await parent.route.resolve<C, T>(context)
      }
    }
    return parent.route.route
  }

  return null
}

export const overrideParams = (route: CommonRoute, overrides?: Partial<CommonRoute>, filter?: string[]) => {
  Object.entries(overrides ?? {}).forEach(([key, value]) => {
    if (route[key as keyof CommonRoute] == null
      && (filter == null || filter.includes(key))) {
      (route[key as keyof CommonRoute] as CommonRoute[keyof CommonRoute]) = value
    }
  })
}

export const resolve = <C extends Config, T extends BasicContext<C>>(route: CommonRoute) => async (context: T) => {
  if (route.resolved) return route
  route.resolved = true

  if (context.cfg.services == null) {
    throw new SyntaxError('Services aren\'t configured to resolve routes')
  }

  const firstGuessService = context.cfg.services[route.service ?? context.cfg.service]
  if (firstGuessService != null && !isServiceRoute(firstGuessService)) {
    throw new SyntaxError('Service is not a valid service route')
  }
  const service = firstGuessService?.type === route.type ? firstGuessService
    : Object.values(context.cfg.services).find<CommonServiceRoute>(
      (service): service is CommonServiceRoute => {
        const _service = service as CommonServiceRoute
        return _service.default === true && _service.type === route.type
      }
    ) ?? Object.values(context.cfg.services).find<CommonServiceRoute>(
      (service): service is CommonServiceRoute => {
        const _service = service as CommonServiceRoute
        return _service.type === route.type
      }
    )
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

  // Internal host access is non secure only
  // it's required for server side client routes
  if ("internalHost" in route) {
    if (route.internalHost === route.host) {
      route.secure = false
    }
  } else if ("internalHost" in service) {
    if (service.internalHost === route.host) {
      route.secure = false
    }
  }
  

  const parent = await getParentRoute<C, T>(context, route)
  if (parent != null) {
    route.path = (parent.path.startsWith(SEP) ? SEP : '')
      + normalizePath(normalizePath(parent.path) + SEP + normalizePath(route.path))
  }

  // Moved base resolution to the final service
  // if (parent == null && route.base != null && route.base.trim() !== '') {
  //   route.path = SEP + normalizePath(route.base) + SEP + normalizePath(route.path)
  //   // route.path = route.base.startsWith(SEP) ? SEP + route.path : route.path
  // }

  console.log(`Route resolves: ${route.alias} to ${route.path} : ${route.host}`)

  return route
}

/**
 * @throws {SyntaxError}
 */
const assertCycle = <C extends BasicConfig, T extends BasicContext<C>>(context: T, route: CommonRoute, parent: CommonRoute) => {
  while (parent.parent != null) {
    if (parent.parent === route.alias) {
      throw new SyntaxError(`Route parentship cycle detected. Parent: ${parent.alias} has his child as ancestor ${route.alias}`)
    }
    parent = context.module<Contextual & { _module: true, route: CommonRouteModel }>(parent.parent).route.route
  }
}

export const prependBase = (route: CommonRoute) => {
  let path = route.path
  if (route.base != null && route.base.trim() !== '') {
    path = SEP + normalizePath(route.base) + SEP + normalizePath(route.path)
    // route.path = route.base.startsWith(SEP) ? SEP + route.path : route.path
  }
  return path
}
