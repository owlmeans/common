import { materializeEntrypoint } from '@owlmeans/entrypoint'
import type { EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import { entrypoint } from './entrypoint.js'
import type {
  BoundEntrypointHandler, EntrypointOptions, ServerProtocolEntrypoint,
} from './types.js'

/** Bind one immutable protocol and, when present, its protocol-bound implementation. */
export const bind = <Protocol extends EntrypointProtocolDeclaration>(
  protocol: Protocol,
  implementation?: BoundEntrypointHandler<Protocol>,
  options?: EntrypointOptions<object>,
): ServerProtocolEntrypoint<Protocol> => {
  const bound = Object.assign(entrypoint(
    materializeEntrypoint(protocol),
    implementation?.bind,
    options,
  ), { protocol })

  return bound as ServerProtocolEntrypoint<Protocol>
}
