
import { bind } from '@owlmeans/server-entrypoint'
import type { ServerProtocolEntrypoint } from '@owlmeans/server-entrypoint'
import { authProtocols } from '@owlmeans/auth-common'
import type { EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import { authenticate } from './actions/service.js'

/** Server entrypoints required by the generic authentication service. */
export const entrypoints: ServerProtocolEntrypoint<EntrypointProtocolDeclaration>[] = [
  bind(authProtocols.dispatcher),
  bind(authProtocols.dispatcherAuthenticate, authenticate(authProtocols.dispatcherAuthenticate)),
]
