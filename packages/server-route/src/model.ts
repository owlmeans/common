import type { Context } from '@owlmeans/server-context'
import type { RouteModel, RouteOptions, ServiceRoute } from './types.js'
import type { BasicRouteModel } from './utils/types.js'
import { DEFAULT_FIELD } from './consts.js'
import { matchToPathes } from './utils/route.js'
import { resolve, overrideParams } from '@owlmeans/route/utils'

export const route = <R>(route: BasicRouteModel, intermediate: boolean, opts?: RouteOptions<R>) => {
  const model: RouteModel<R> = {
    ...route,

    isIntermediate: () => intermediate,

    resolve: async <C>(context: C) => {
      if (model.route.resolved) {
        return model.route
      }
      const ctx = context as Context
      await resolve(model.route)(ctx)
      const service = ctx.cfg.services[route.route.service ?? ctx.cfg.service] as ServiceRoute
      if (service.internalHost != null) {
        model.route.internalHost = service.internalHost
        model.route.internalPort = model.route.internalPort ?? service.internalPort
      }
      return model.route
    },

    match: <Request extends R>(request: Request) => {
      if (opts?.match != null) {
        return opts.match(request)
      }
      if (!model.route.resolved) {
        throw SyntaxError('Route not resolved')
      }

      const req = request as Record<string, string>
      let path = req[opts?.pathField ?? DEFAULT_FIELD] as string

      const { match, partial } = matchToPathes(model.route.path, path)

      return match || (intermediate && partial)
    }
  }

  overrideParams(model.route, opts?.overrides)

  return model
}
