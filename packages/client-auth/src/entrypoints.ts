
import { bind, bindScreen, stab } from '@owlmeans/client-entrypoint'
import { authProtocols } from '@owlmeans/auth-common'

/** Browser bindings for the authentication protocols every client may call. */
export const bindings = [bind(authProtocols.dispatcherAuthenticate)]

/** Bind the external-authentication screen to one explicitly selected service. */
export const bindExternalAuthentication = (service: string) =>
  bindScreen(authProtocols.flowEnter, stab, { routeOptions: { overrides: { service } } })
