import { materializeEntrypoint } from '@owlmeans/entrypoint'
import type {
  CommonEntrypoint, EntrypointProtocolDeclaration,
} from '@owlmeans/entrypoint'
import { isServerRouteModel, route } from '@owlmeans/server-route'
import type {
  BoundEntrypointHandler, EntrypointOptions, EntrypointRef, RefedEntrypointHandler, ServerEntrypoint,
  ServerProtocolEntrypoint,
} from './types.js'

type ServerBinding<Protocol extends EntrypointProtocolDeclaration> =
  | BoundEntrypointHandler<Protocol>
  | RefedEntrypointHandler

/** Attach a server implementation to an entrypoint materialized from a protocol declaration. */
const bindMaterializedEntrypoint = <R>(
  declaration: CommonEntrypoint,
  handler?: RefedEntrypointHandler<R>,
  options?: EntrypointOptions<R>,
): ServerEntrypoint<R> => {
  const ref: EntrypointRef<R> = { ref: undefined }
  const intermediate = options?.intermediate
    ?? (isServerRouteModel(declaration.route) ? declaration.route.isIntermediate() : false)
  const bound = declaration as ServerEntrypoint<R>

  bound.route = route(declaration.route, intermediate, options?.routeOptions)
  bound.filter = options?.filter ?? declaration.filter
  bound.guards = [...new Set([...(declaration.guards ?? []), ...(options?.guards ?? [])])]
  bound.gate = options?.gate ?? declaration.gate
  bound.gateParams = options?.gateParams ?? declaration.gateParams
  bound.fixer = options?.fixer ?? bound.fixer
  if (handler != null) bound.handle = handler(ref)
  ref.ref = bound

  return bound
}

/** Bind one immutable protocol and, when present, its protocol-bound implementation. */
export const bind = <Protocol extends EntrypointProtocolDeclaration>(
  protocol: Protocol,
  implementation?: ServerBinding<Protocol>,
  options?: EntrypointOptions<object>,
): ServerProtocolEntrypoint<Protocol> => {
  const handler = typeof implementation === 'function'
    ? implementation
    : implementation?.bind
  const bound = Object.assign(bindMaterializedEntrypoint(
    materializeEntrypoint(protocol),
    handler,
    options,
  ), { protocol })

  return bound as ServerProtocolEntrypoint<Protocol>
}

/** Bind a flat declaration collection and pair each protocol with its own implementation. */
export const bindAll = <Protocol extends EntrypointProtocolDeclaration>(
  declarations: readonly Protocol[],
  implementations: readonly BoundEntrypointHandler<Protocol>[] = [],
): ServerProtocolEntrypoint<Protocol>[] => declarations.map(declaration =>
  bind(declaration, implementations.find(implementation => implementation.protocol === declaration)),
)
