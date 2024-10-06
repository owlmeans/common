import type { CommonRoute, CommonRouteModel } from './types.js'
import type { CreateRouteSignature } from './utils/types.js'
import { resolve } from './utils/route.js'
import { AppType, BasicConfig, BasicContext } from '@owlmeans/context'

export const makeRouteModel = (route: CommonRoute): CommonRouteModel => {
  const model: CommonRouteModel = {
    route,
    resolve: ctx => resolve(route)(ctx as unknown as BasicContext<BasicConfig>)
  }

  return model
}

export const createRoute: CreateRouteSignature<CommonRoute> = (alias, path, opts?) => {
  const route: CommonRoute = {
    alias,
    type: AppType.Backend,
    path,
    resolved: false,
    ...(typeof opts === 'string' ? { parent: opts } : opts)
  }

  return route
}
