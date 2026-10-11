import type { EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import type { BoundEntrypointHandler, RefedEntrypointHandler } from './types.js'

export type ServerBinding<Protocol extends EntrypointProtocolDeclaration> =
  | BoundEntrypointHandler<Protocol>
  | RefedEntrypointHandler
