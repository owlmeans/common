import type { Context } from '@owlmeans/client-context'
import type { RouteModel, RouteOptions } from './types.js'
import type { BasicRouteModel } from './utils/types.js'
import { resolve, overrideParams } from '@owlmeans/route/utils'

export const route = (route: BasicRouteModel, opts?: RouteOptions): RouteModel => {
  const unresolvedPath = route.route.path

  const model: RouteModel = {
    ...(route as RouteModel),

    _client: true,

    resolve: async <C>(context: C) => {
      if (model.route.resolved) {
        if (model._resolved == null) {
          throw new SyntaxError('Cannot reach resolved state twice without resolving promise')
        }
        await model._resolved

        return model.route
      }

      const resolver: { resolve?: () => void } = {}
      model._resolved = new Promise(resolve => resolver.resolve = resolve)

      const ctx = context as Context
      await resolve(model.route)(ctx)

      model.route.partialPath = unresolvedPath

      resolver.resolve?.()

      return model.route
    }
  }

  overrideParams(model.route, opts?.overrides)

  model.route.partialPath = unresolvedPath

  return model
}
