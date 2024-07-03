import type { Context } from '@owlmeans/client-context'
import type { RouteModel, RouteOptions } from './types.js'
import type { BasicRouteModel } from './utils/types.js'

export const route = (route: BasicRouteModel, opts?: RouteOptions): RouteModel => {
  const unresolvedPath = route.route.path
  console.log(`${route.route.alias} unresolved path: ${unresolvedPath}`)
  const model: RouteModel = {
    _client: true,

    ...{
      ...route, route: {
        ...route.route, partialPath: unresolvedPath
      }
    },

    resolve: async <C>(context: C) => {
      if (model.route.resolved) {
        return model.route
      }
      const ctx = context as Context
      const params = await route.resolve(ctx)

      model.route = { ...model.route, ...params }

      model.route.partialPath = unresolvedPath

      return model.route
    }
  }

  model.route = {
    ...model.route,
    ...opts?.overrides
  }


  return model
}
