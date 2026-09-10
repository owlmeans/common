import type { ServerRouteModel, ServerRouteOptions } from '@owlmeans/server-route'
import type {
  CommonEntrypoint, EntrypointHandler, CommonEntrypointOptions, EntrypointProtocolDeclaration,
} from '@owlmeans/entrypoint'
import type { Service } from '@owlmeans/context'

export interface ServerEntrypoint<R> extends CommonEntrypoint {
  route: ServerRouteModel<R>
  fixer?: string
  handle: EntrypointHandler
}

export interface EntrypointOptions<R> extends CommonEntrypointOptions {
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

/** The server-local representation of a shared protocol declaration. */
export type ServerProtocolEntrypoint<Protocol extends EntrypointProtocolDeclaration> = ServerEntrypoint<object> & {
  readonly protocol: Protocol
}

/** A handler that is inseparable from the protocol whose request it accepts. */
export interface BoundEntrypointHandler<Protocol extends EntrypointProtocolDeclaration> {
  readonly protocol: Protocol
  bind: RefedEntrypointHandler
}
