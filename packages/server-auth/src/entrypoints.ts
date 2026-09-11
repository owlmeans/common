
import { bind } from '@owlmeans/server-entrypoint'
import { authProtocols } from '@owlmeans/auth-common'
import { authenticate } from './actions/service.js'

/** Server bindings required by the generic authentication service. */
export const bindings = [
  bind(authProtocols.dispatcher),
  bind(authProtocols.dispatcherAuthenticate, authenticate(authProtocols.dispatcherAuthenticate)),
]
