import type { RouteOptions } from '../types.js'

export interface CreateRouteSignature<R> {
  (alias: string, path: string, opts?: RouteOptions | string): R
}
