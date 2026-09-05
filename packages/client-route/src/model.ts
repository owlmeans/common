import type { RouteModel } from '@owlmeans/route'
import type { ClientRouteModel, ClientRouteOptions } from './types.js'
import { overrideParams } from '@owlmeans/route/utils'

/**
 * Mark a route model as a client one and fill in whatever the declaration left blank.
 * The declared `path` stays the segment this route contributes — the entrypoint composes the
 * full path and the address on demand.
 */
export const route = (route: RouteModel, opts?: ClientRouteOptions): ClientRouteModel => {
  const model: ClientRouteModel = {
    ...(route as ClientRouteModel),

    _client: true
  }

  overrideParams(model.route, opts?.overrides)

  return model
}
