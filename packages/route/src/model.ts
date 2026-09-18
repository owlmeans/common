import type { RouteDeclaration, RouteModel } from './types.js'
import type { CreateRouteSignature } from './utils/types.js'
import { AppType } from '@owlmeans/context'

export const makeRouteModel = (route: RouteDeclaration): RouteModel => ({ route })

export const createRoute: CreateRouteSignature<RouteDeclaration> = (alias, path, opts?) => {
  const options = typeof opts === 'string' ? { parent: opts } : opts
  const { parent, ...rest } = options ?? {}
  const route: RouteDeclaration = {
    alias,
    type: AppType.Backend,
    path,
    ...rest,
    ...(parent == null ? {} : { parent: typeof parent === 'string' ? parent : parent.alias }),
  }

  return route
}
