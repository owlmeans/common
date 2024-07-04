import type { Context } from '@owlmeans/client-context'
import type { RouteModel, RouteOptions } from './types.js'
import type { BasicRouteModel } from './utils/types.js'
import { resolve, overrideParams } from '@owlmeans/route/utils'

export const route = (route: BasicRouteModel, opts?: RouteOptions): RouteModel => {
  const unresolvedPath = route.route.path
  console.log(`${route.route.alias} unresolved path: ${unresolvedPath}`)

  const model: RouteModel = {
    ...(route as RouteModel),

    _client: true,

    resolve: async <C>(context: C) => {
      if (model.route.resolved) {
        return model.route
      }
      const ctx = context as Context
      await resolve(model.route)(ctx)

      model.route.partialPath = unresolvedPath

      return model.route
    }
  }

  overrideParams(model.route, opts?.overrides)

  model.route.partialPath = unresolvedPath

  return model
}
