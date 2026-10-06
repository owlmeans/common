import { materializeEntrypoint, protocols } from '@owlmeans/entrypoint'
import type { EntrypointProtocolDeclaration, EntrypointTree } from '@owlmeans/entrypoint'
import { bindMaterializedEntrypoint } from './entrypoint.js'
import type {
  ClientEntrypointOptions, ClientProtocolEntrypoint, RefedEntrypointHandler,
} from './types.js'

/** Bind a shared protocol to the client context without changing the declaration itself. */
export const bind = <Protocol extends EntrypointProtocolDeclaration>(
  protocol: Protocol,
  options?: ClientEntrypointOptions,
): ClientProtocolEntrypoint<Protocol> => {
  const bound = Object.assign(bindMaterializedEntrypoint(
    materializeEntrypoint(protocol),
    undefined,
    options,
  ), { protocol })

  return bound as ClientProtocolEntrypoint<Protocol>
}

/** Materialize every protocol in an exported declaration tree for a browser context. */
export const bindAll = (tree: EntrypointTree): ClientProtocolEntrypoint<EntrypointProtocolDeclaration>[] =>
  protocols(tree).map(protocol => bind(protocol))

/** Bind a frontend protocol to the component that renders it. */
export const bindScreen = <Protocol extends EntrypointProtocolDeclaration>(
  protocol: Protocol,
  handler: RefedEntrypointHandler,
  options?: ClientEntrypointOptions,
): ClientProtocolEntrypoint<Protocol> => {
  const bound = Object.assign(bindMaterializedEntrypoint(
    materializeEntrypoint(protocol),
    handler,
    options,
  ), { protocol })

  return bound as ClientProtocolEntrypoint<Protocol>
}
