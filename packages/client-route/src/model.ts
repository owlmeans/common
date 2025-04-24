import type { CommonRouteModel } from '@owlmeans/route'
import type { ClientRouteModel, ClientRouteOptions } from './types.js'
import { resolve, overrideParams } from '@owlmeans/route/utils'
import type { BasicConfig, BasicContext } from '../../context/build/types.js'

export const route = (route: CommonRouteModel, opts?: ClientRouteOptions): ClientRouteModel => {
  const unresolvedPath = route.route.path

  const model: ClientRouteModel = {
    ...(route as ClientRouteModel),

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

      await resolve(model.route)(context as BasicContext<BasicConfig>)

      model.route.partialPath = unresolvedPath

      resolver.resolve?.()

      return model.route
    }
  }

  overrideParams(model.route, opts?.overrides)

  model.route.partialPath = unresolvedPath

  return model
}
