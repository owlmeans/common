import { createLazyService } from '@owlmeans/context'
import type { AuthService } from '@owlmeans/auth-common'
import { DEFAULT_ALIAS as AUTH_SERVICE } from '@owlmeans/client-auth'
import { loginLandingOf } from '@owlmeans/client-auth/login'
import type { ClientConfig } from '@owlmeans/client-context'
import { EMAIL_LOGIN_SERVICE, EmailAuthError } from '@owlmeans/auth-email'
import type { EmailAuthEntrypoints, EmailAuthOptionsView } from '@owlmeans/auth-email'
import { emailStorageHelper } from './storage.js'
import { signedInAccount } from './utils/account.js'
import type {
  EmailLoginClientContext, EmailLoginClientService, EmailLoginScreenComponent, MakeEmailLoginClientOptions,
} from './types.js'

/**
 * Build the browser-side `EmailLoginClientService` over one protocol tree.
 *
 * Every call goes through `ctx.entrypoint(protocol)`, so the application binds the API routes
 * itself (`bindAll`) — the same split as marketing consent's client.
 */
export const makeEmailLoginClient = (
  protocols: EmailAuthEntrypoints, opts: MakeEmailLoginClientOptions = {},
): EmailLoginClientService => {
  const alias = opts.alias ?? EMAIL_LOGIN_SERVICE

  let options: EmailAuthOptionsView | null = null
  let screen: EmailLoginScreenComponent | null = opts.screen ?? null

  const ctx = (): EmailLoginClientContext =>
    service.assertCtx<ClientConfig, EmailLoginClientContext>(alias)

  const service: EmailLoginClientService = createLazyService<EmailLoginClientService>(alias, {
    protocols: () => protocols,

    options: async request => {
      if (request?.fresh !== true && options != null) {
        return options
      }
      options = await ctx().entrypoint(protocols.options).call({})

      return options
    },

    sendPin: async request => await ctx().entrypoint(protocols.pin).call({ body: request }),

    signIn: async request => await ctx().entrypoint(protocols.signIn).call({ body: request }),

    complete: async view => {
      if (view.token == null || view.token === '') {
        throw new EmailAuthError('answer')
      }
      const context = ctx()
      await context.service<AuthService>(AUTH_SERVICE).authenticate({ token: view.token })

      // Kept AFTER the token is adopted, so the ticket names the account it belongs to and a sign-in
      // that failed keeps nothing. Any older ticket is dropped by the sign-in that does not bring one.
      if (view.offer != null && view.offer !== '') {
        emailStorageHelper.keepOffer(view.offer, signedInAccount(context))
      } else {
        emailStorageHelper.dropOffer()
      }

      // The supervisor and OAuth plugins land the same way: a full load of the landing, which
      // inside a surrogate window is the dispatcher that hands the session back to the opener.
      const landings = loginLandingOf(context)
      const landing = await landings.landAfterLogin()
      window.location.href = await landings.landingUrl(landing)
    },

    passwordStatus: async () => await ctx().entrypoint(protocols.password.status).call({}),

    passwordPin: async request => await ctx().entrypoint(protocols.password.pin).call({ body: request }),

    setPassword: async request => await ctx().entrypoint(protocols.password.set).call({ body: request }),

    removePassword: async request => await ctx().entrypoint(protocols.password.remove).call({ body: request }),

    declinePassword: async () => await ctx().entrypoint(protocols.password.decline).call({ body: {} }),

    screen: () => screen,

    registerScreen: next => { screen = next },
  })

  return service
}

/** Register the client service, unless the application already registered its own under the alias. */
export const appendEmailLoginClient = (
  context: EmailLoginClientContext, protocols: EmailAuthEntrypoints, opts: MakeEmailLoginClientOptions = {},
): void => {
  const alias = opts.alias ?? EMAIL_LOGIN_SERVICE
  if (!context.hasService(alias)) {
    context.registerService(makeEmailLoginClient(protocols, opts))
  }
}
