
import { authProtocols } from '@owlmeans/auth-common'
import { handler } from '@owlmeans/client'
import { bind, bindScreen, stab } from '@owlmeans/client-entrypoint'
import { AuthenticationHOC } from './components/authentication/component.js'

/** Browser bindings for the manager's authentication flows. */
export const bindings = [
  bind(authProtocols.authen),
  bind(authProtocols.init),
  bind(authProtocols.authenticate),
  bind(authProtocols.rely),
  bind(authProtocols.client),
  bind(authProtocols.login),
  bindScreen(authProtocols.loginDefault, handler(AuthenticationHOC())),
  bindScreen(authProtocols.loginTyped, handler(AuthenticationHOC())),
  bindScreen(authProtocols.dispatcher, stab),
]
