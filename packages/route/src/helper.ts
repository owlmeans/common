import { AppType } from '@owlmeans/context'
import { SEP } from './consts.js'
import { createRoute, makeRouteModel } from './model.js'
import type { RouteModel, RouteOptions } from './types.js'
import type { CreateRouteSignature } from './utils/types.js'

export const route: CreateRouteSignature<RouteModel> = (alias, path, opts?) =>
  makeRouteModel(createRoute(alias, path, opts))

export const normalizePath = (path: string): string => {
  path = path.endsWith(SEP) ? path.slice(0, -1) : path
  path = path.startsWith(SEP) ? path.substring(1) : path

  return path
}

export const rtype = (type: AppType, opts?: RouteOptions | string): Partial<RouteOptions> => (
  { type, ...(typeof opts === 'string' ? { parent: opts } : opts) }
)

export const backend = (opts?: RouteOptions | string): Partial<RouteOptions> => 
  rtype(AppType.Backend, opts)

export const frontend = (opts?: RouteOptions | string): Partial<RouteOptions> =>
  rtype(AppType.Frontend, opts)
