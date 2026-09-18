
import { bind, bindScreen, stab } from '@owlmeans/client-entrypoint'
import { authProtocols } from '@owlmeans/auth-common'

/** Browser entrypoints for the authentication protocols every client may call. */
export const entrypoints = [bind(authProtocols.dispatcherAuthenticate)]

/** Bind the external-authentication screen to one explicitly selected service. */
export const bindExternalAuthentication = (service: string) =>
  bindScreen(authProtocols.flowEnter, stab, { routeOptions: { overrides: { service } } })
