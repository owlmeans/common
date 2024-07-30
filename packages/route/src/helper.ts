import { AppType } from '@owlmeans/context'
import { RouteMethod, SEP } from './consts.js'
import { createRoute, makeRouteModel } from './model.js'
import type { CommonRouteModel, RouteOptions } from './types.js'
import type { CreateRouteSignature } from './utils/types.js'

export const route: CreateRouteSignature<CommonRouteModel> = (alias, path, opts?) =>
  makeRouteModel(createRoute(alias, path, opts))

export const normalizePath = (path: string): string => {
  path = path.endsWith(SEP) ? path.slice(0, -1) : path
  path = path.startsWith(SEP) ? path.substring(1) : path

  return path
}

export const rtype = (type: AppType, opts?: RouteOptions | string): Partial<RouteOptions> => (
  { type, ...(typeof opts === 'string' ? { parent: opts } : opts) }
)

export const backend = (opts?: RouteOptions | string, method?: RouteOptions | RouteMethod): Partial<RouteOptions> => {
  if (typeof method === 'string') {
    opts = typeof opts === 'string' ? { parent: opts, method } : { method, ...opts }
  }

  return rtype(AppType.Backend, opts)
}

export const frontend = (opts?: RouteOptions | string, def?: RouteOptions | boolean): Partial<RouteOptions> => {
  if (typeof def === 'boolean') {
    opts = typeof opts === 'string' ? { parent: opts, default: def } : { default: def, ...opts }
  }

  return rtype(AppType.Frontend, opts)
}
