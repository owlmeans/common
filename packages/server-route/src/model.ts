import type { ServerRouteModel, ServerRouteOptions } from './types.js'
import { DEFAULT_FIELD } from './consts.js'
import { matchToPathes } from './utils/route.js'
import { overrideParams } from '@owlmeans/route/utils'
import type { RouteModel } from '@owlmeans/route'

/**
 * Wrap a route model for server use. The declaration is left as declared — where the route answers
 * and which host it is reachable on are computed from the context by the entrypoint.
 */
export const route = <R>(route: RouteModel, intermediate: boolean, opts?: ServerRouteOptions<R>) => {
  const model: ServerRouteModel<R> = {
    ...route,

    isIntermediate: () => intermediate,

    match: <Request extends R>(request: Request, mount: string) => {
      if (opts?.match != null) {
        return opts.match(request, mount)
      }

      const req = request as Record<string, string>
      const path = req[opts?.pathField ?? DEFAULT_FIELD] as string

      const { match, partial } = matchToPathes(mount, path)

      return match || (intermediate && partial)
    }
  }

  overrideParams(model.route, opts?.overrides)

  return model
}
