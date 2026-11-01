import type { AuthenticationPlugin, AuthMethodMeta } from '@owlmeans/client-auth/manager/plugins'
import { EMAIL_LOGIN_METHOD, EMAIL_LOGIN_SERVICE } from '@owlmeans/auth-email'
import { EMAIL_LOGIN_METHOD_META } from './consts.js'
import { EmailLoginRoute } from './components/route.js'

/**
 * The `email` authentication plugin: a self-contained method whose route
 * (`/authentication/login/email`) renders the e-mail card and completes the sign-in itself.
 *
 * It needs no renderer, and it is offered only where `appendEmailLogin` registered the client
 * service — so a bundle that merely contains this package never grows a button that cannot work.
 */
export const makeEmailLoginPlugin = (method?: Partial<AuthMethodMeta>): AuthenticationPlugin => ({
  type: EMAIL_LOGIN_METHOD,
  requiresRenderer: false,
  method: {
    ...EMAIL_LOGIN_METHOD_META,
    ...method,
    available: ctx => ctx.context.hasService(EMAIL_LOGIN_SERVICE),
  },
  Implementation: () => EmailLoginRoute,
})
