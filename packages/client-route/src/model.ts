import type { Context } from '@owlmeans/client-context'
import type { RouteModel, RouteOptions } from './types.js'
import type { BasicRouteModel } from './utils/types.js'

export const route = (route: BasicRouteModel, opts?: RouteOptions): RouteModel => {
  const model: RouteModel = {
    _client: true,

    ...route,

    resolve: async <C>(context: C) => {
      if (model.route.resolved) {
        return model.route
      }
      const ctx = context as Context
      const params = await route.resolve(ctx)

      model.route = { ...model.route, ...params }

      return model.route
    }
  }

  model.route = { ...model.route, ...opts?.overrides }

  return model
}
