import type { BasicConfig, BasicContext, Contextual } from '@owlmeans/context'
import type { RouteAddress, RouteDeclaration, RouteModel, CommonServiceRoute, ResolvedServiceRoute } from '../types.js'
import { isServiceRoute, isServiceRouteResolved } from './service.js'
import { normalizePath } from '../helper.js'
import { RouteProtocols, SEP } from '../consts.js'

type Config = BasicConfig

/** What an entrypoint looks like from the route layer: something that carries a route model. */
interface RouteCarrier extends Contextual {
  _entrypoint: true
  route: RouteModel
}

const carrier = <C extends Config, T extends BasicContext<C>>(context: T, alias: string): RouteCarrier =>
  context.entrypoint<RouteCarrier>(alias)

export const getParentRoute = <C extends Config, T extends BasicContext<C>>(
  context: T, route: RouteDeclaration
): RouteDeclaration | null => {
  if (route.parent == null) {
    return null
  }
  const parent = carrier<C, T>(context, route.parent)
  if (parent.route == null) {
    throw new SyntaxError('Parent entrypoint doesn\'t provide a route')
  }
  assertCycle<C, T>(context, route, parent.route.route)

  return parent.route.route
}

export const overrideParams = (route: RouteDeclaration, overrides?: Partial<RouteDeclaration>, filter?: string[]) => {
  Object.entries(overrides ?? {}).forEach(([key, value]) => {
    if (route[key as keyof RouteDeclaration] == null
      && (filter == null || filter.includes(key))) {
      (route[key as keyof RouteDeclaration] as RouteDeclaration[keyof RouteDeclaration]) = value
    }
  })
}

/**
 * Pick the service route this declaration answers on: the one it names, else the default of its
 * app type, else the first of its app type.
 *
 * @throws {SyntaxError}
 */
export const resolveService = <C extends Config, T extends BasicContext<C>>(
  context: T, route: RouteDeclaration
): ResolvedServiceRoute => {
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

/**
 * The full path: every ancestor's declared segment, then this one. Walks the parent chain through
 * the context, so a declaration always states only what it contributes.
 */
export const resolvePath = <C extends Config, T extends BasicContext<C>>(
  context: T, route: RouteDeclaration
): string => {
  const parent = getParentRoute<C, T>(context, route)
  if (parent == null) {
    return route.path
  }
  const parentPath = resolvePath<C, T>(context, parent)

  return (parentPath.startsWith(SEP) ? SEP : '')
    + normalizePath(normalizePath(parentPath) + SEP + normalizePath(route.path))
}

/** `base` + the full path — what a server mounts and a client requests. */
export const resolveMount = <C extends Config, T extends BasicContext<C>>(
  context: T, route: RouteDeclaration
): string => {
  const path = resolvePath<C, T>(context, route)
  const base = route.base ?? resolveService<C, T>(context, route).base

  return base != null && base.trim() !== ''
    ? SEP + normalizePath(base) + SEP + normalizePath(path)
    : path
}

/**
 * Where the route answers. A backend caller reaching a service over its INTERNAL host is inside the
 * cluster, so that hop is never TLS.
 */
export const resolveAddress = <C extends Config, T extends BasicContext<C>>(
  context: T, route: RouteDeclaration
): RouteAddress => {
  const service = resolveService<C, T>(context, route)
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

/** Does this route belong to the service the asking context IS? */
export const isLocalRoute = <C extends Config, T extends BasicContext<C>>(
  context: T, route: RouteDeclaration
): boolean => (route.service ?? context.cfg.service) === context.cfg.service

/**
 * @throws {SyntaxError}
 */
const assertCycle = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, route: RouteDeclaration, parent: RouteDeclaration
) => {
  while (parent.parent != null) {
    if (parent.parent === route.alias) {
      throw new SyntaxError(`Route parentship cycle detected. Parent: ${parent.alias} has his child as ancestor ${route.alias}`)
    }
    parent = carrier<C, T>(context, parent.parent).route.route
  }
}

export const prependBase = (route: RouteDeclaration, path: string) =>
  route.base != null && route.base.trim() !== ''
    ? SEP + normalizePath(route.base) + SEP + normalizePath(path)
    : path
