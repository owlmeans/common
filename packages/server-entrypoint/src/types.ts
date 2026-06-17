import type { ServerRouteModel, ServerRouteOptions } from '@owlmeans/server-route'
import type { CommonEntrypoint, EntrypointHandler, CommonEntrypointOptions } from '@owlmeans/entrypoint'
import type { Service } from '@owlmeans/context'

export interface ServerEntrypoint<R> extends CommonEntrypoint {
  route: ServerRouteModel<R>
  fixer?: string
  handle: EntrypointHandler
}

export interface EntrypointOptions<R> extends CommonEntrypointOptions {
  /**
   * Force entrypoint to be elevated even if it is already elevated
   */
  force?: boolean
  fixer?: string
  intermediate?: boolean
  routeOptions?: ServerRouteOptions<R>
}

export interface FixerService extends Service {
  handle: <R>(reply: R, error: Error) => void
}

export interface EntrypointRef<R> {
  ref?: ServerEntrypoint<R>
}

export interface RefedEntrypointHandler<R = {}> {
  (ref: EntrypointRef<R>): EntrypointHandler
}
