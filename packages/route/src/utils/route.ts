import { memoHelper } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import type { RouteAddress, RouteDeclaration, CommonServiceRoute, ResolvedServiceRoute } from '../types.js'
import { serviceRouteHelper } from './service.js'
import { normalizePath } from '../helper.js'
import { RouteProtocols, SEP } from '../consts.js'
import type { Config, RouteCarrier } from './types.local.js'
import type { RouteAddressHelper } from './route/types.js'

export const makeRouteAddressHelper = <C extends Config, T extends BasicContext<C>>(context: T): RouteAddressHelper => {
  const { isServiceRoute, isServiceRouteResolved } = serviceRouteHelper

  const carrier = (alias: string): RouteCarrier =>
    context.entrypoint<RouteCarrier>(alias)

  const getParentRoute = (route: RouteDeclaration): RouteDeclaration | null => {
    if (route.parent == null) {
      return null
    }
    const parent = carrier(route.parent)
    if (parent.route == null) {
      throw new SyntaxError('Parent entrypoint doesn\'t provide a route')
    }
    assertCycle(route, parent.route.route)

    return parent.route.route
  }

  const resolveService = (route: RouteDeclaration): ResolvedServiceRoute => {
    if (context.cfg.services == null) {
      throw new SyntaxError('Services aren\'t configured to resolve routes')
    }

    const named = context.cfg.services[route.service ?? context.cfg.service]
    if (named != null && !isServiceRoute(named)) {
      throw new SyntaxError('Service is not a valid service route')
    }

    const service = named?.type === route.type ? named
      : Object.values(context.cfg.services).find<CommonServiceRoute>(
        (candidate): candidate is CommonServiceRoute => {
          const _candidate = candidate as CommonServiceRoute
          return _candidate.default === true && _candidate.type === route.type
        }
      ) ?? Object.values(context.cfg.services).find<CommonServiceRoute>(
        (candidate): candidate is CommonServiceRoute => (candidate as CommonServiceRoute).type === route.type
      )

    if (!isServiceRoute(service)) {
      throw new SyntaxError('Service is not a valid service route')
    }
    if (!isServiceRouteResolved(service)) {
      throw new SyntaxError('Service route is not resolved')
    }

    return service
  }

  const resolvePath = (route: RouteDeclaration): string => {
    const parent = getParentRoute(route)
    if (parent == null) {
      return route.path
    }
    const parentPath = resolvePath(parent)

    return (parentPath.startsWith(SEP) ? SEP : '')
      + normalizePath(normalizePath(parentPath) + SEP + normalizePath(route.path))
  }

  const resolveMount = (route: RouteDeclaration): string => {
    const path = resolvePath(route)
    const base = route.base ?? resolveService(route).base

    return base != null && base.trim() !== ''
      ? SEP + normalizePath(base) + SEP + normalizePath(path)
      : path
  }

  const resolveAddress = (route: RouteDeclaration): RouteAddress => {
    const service = resolveService(route)
    const host = route.host ?? service.host
    const internalHost = route.internalHost ?? service.internalHost

    return {
      host,
      port: route.port ?? service.port,
      base: route.base ?? service.base,
      secure: internalHost != null && internalHost === host ? false : route.secure ?? true,
      protocol: route.protocol ?? RouteProtocols.WEB,
    }
  }

  const isLocalRoute = (route: RouteDeclaration): boolean =>
    (route.service ?? context.cfg.service) === context.cfg.service

  /**
   * @throws {SyntaxError}
   */
  const assertCycle = (route: RouteDeclaration, parent: RouteDeclaration): void => {
    while (parent.parent != null) {
      if (parent.parent === route.alias) {
        throw new SyntaxError(`Route parentship cycle detected. Parent: ${parent.alias} has his child as ancestor ${route.alias}`)
      }
      parent = carrier(parent.parent).route.route
    }
  }

  return { getParentRoute, resolveService, resolvePath, resolveMount, resolveAddress, isLocalRoute }
}

export const routeAddressOf = memoHelper.oncePer(makeRouteAddressHelper)
