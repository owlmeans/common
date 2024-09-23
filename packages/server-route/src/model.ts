import type { ServerRouteModel, ServerRouteOptions, ServiceRoute } from './types.js'
import { DEFAULT_FIELD } from './consts.js'
import { matchToPathes } from './utils/route.js'
import { resolve, overrideParams } from '@owlmeans/route/utils'
import type { CommonRouteModel } from '@owlmeans/route'

export const route = <R>(route: CommonRouteModel, intermediate: boolean, opts?: ServerRouteOptions<R>) => {
  const model: ServerRouteModel<R> = {
    ...route,

    isIntermediate: () => intermediate,

    resolve: async context => {
      if (model.route.resolved) {
        return model.route
      }
      const ctx = context

      await resolve<typeof ctx["cfg"], typeof ctx>(model.route)(ctx)
      const service = ctx.cfg.services?.[route.route.service ?? ctx.cfg.service] as ServiceRoute | undefined
      if (service?.internalHost != null) {
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
