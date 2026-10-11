import type { EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import type { BoundEntrypointHandler } from '@owlmeans/server-entrypoint'

/** A handler bound to one protocol leaf — what `handlers().request()` and `connection()` answer. */
export interface RequestHandler extends BoundEntrypointHandler<EntrypointProtocolDeclaration> {}
