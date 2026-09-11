import { entrypoint } from './entrypoint.js'
import type { CommonEntrypoint, CommonEntrypointOptions, Filter } from './types.js'
import type { EntrypointProtocolDeclaration } from './protocol.js'

/** A context-bound entrypoint made from an immutable protocol declaration. */
export type MaterializedEntrypoint<Protocol extends EntrypointProtocolDeclaration> = CommonEntrypoint & {
  readonly protocol: Protocol
}

const filterOf = (protocol: EntrypointProtocolDeclaration): Filter | undefined => {
  const request = protocol.contract?.requestSchemas
  const response = protocol.contract?.responseSchemas

  if (request == null && response == null) return undefined

  return {
    body: request?.body == null ? undefined : structuredClone(request.body),
    params: request?.params == null ? undefined : structuredClone(request.params),
    query: request?.query == null ? undefined : structuredClone(request.query),
    headers: request?.headers == null ? undefined : structuredClone(request.headers),
    response: response?.byStatus == null
      ? response?.default == null ? undefined : structuredClone(response.default)
      : {
        ...(response.default == null ? {} : { default: structuredClone(response.default) }),
        ...Object.fromEntries(Object.entries(response.byStatus).map(([status, schema]) => [
          status, structuredClone(schema),
        ])),
    },
  }
}

const optionsOf = (protocol: EntrypointProtocolDeclaration): CommonEntrypointOptions => ({
  sticky: protocol.sticky,
  guards: [...protocol.guards],
  gate: protocol.gate?.alias,
  gateParams: protocol.gate == null ? undefined : [...protocol.gate.params],
  filter: filterOf(protocol),
})

/**
 * Make a local, mutable registration from a shared declaration.  The protocol is never mutated;
 * guards, route resolution and handlers belong exclusively to this materialized entrypoint.
 */
export const materializeEntrypoint = <Protocol extends EntrypointProtocolDeclaration>(
  protocol: Protocol,
): MaterializedEntrypoint<Protocol> => Object.assign(
  entrypoint({ route: { ...protocol.route.route } }, optionsOf(protocol)),
  { protocol },
)
