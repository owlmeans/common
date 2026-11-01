import { EMAIL_AUTH_SERVICE } from '@owlmeans/auth-email'
import { handlers } from '@owlmeans/server-api'
import { bind } from '@owlmeans/server-entrypoint'
import type { EmailAuthContext, EmailAuthHandlerOptions, EmailAuthServedProtocols, EmailAuthService } from './types.js'

/**
 * The server bindings of a `makeEmailAuthProtocols` tree, for the application to spread into its
 * entrypoints: the three parent routes (guest base, `password`, `tech` — they carry the guards and
 * gates) and one handler per route, each a call into `EMAIL_AUTH_SERVICE`. The frontend `offer`
 * screen is the browser's. Every route is bound whatever the flags say: the password routes answer
 * `EmailPasswordDisabled` and the developer routes `EmailTechDisabled` (both 404) while off.
 */
export const serveEmailAuthEntrypoints = (
  protocols: EmailAuthServedProtocols, opts: EmailAuthHandlerOptions = {}
) => {
  const api = handlers<EmailAuthContext>()
  const serviceOf = (context: EmailAuthContext): EmailAuthService =>
    context.service<EmailAuthService>(opts.serviceAlias ?? EMAIL_AUTH_SERVICE)
  const { password, tech } = protocols

  return [
    bind(protocols.base),
    bind(protocols.options, api.request(protocols.options, async (req, context) => await serviceOf(context).options(req))),
    bind(protocols.pin, api.body(protocols.pin, async (body, context, req) => await serviceOf(context).sendPin(body, req))),
    bind(protocols.signIn, api.body(protocols.signIn, async (body, context, req) => await serviceOf(context).signIn(body, req))),
    bind(password.base),
    bind(password.status, api.request(password.status, async (req, context) => await serviceOf(context).status(req))),
    bind(password.pin, api.body(password.pin, async (body, context, req) => await serviceOf(context).confirmPin(body, req))),
    bind(password.set, api.body(password.set, async (body, context, req) => await serviceOf(context).setPassword(body, req))),
    bind(password.remove, api.body(password.remove, async (body, context, req) =>
      await serviceOf(context).removePassword(body, req))),
    bind(password.decline, api.body(password.decline, async (_body, context, req) => await serviceOf(context).decline(req))),
    bind(tech.base),
    bind(tech.pin, api.body(tech.pin, async (body, context, req) => await serviceOf(context).techPin(body, req))),
    bind(tech.waiver, api.body(tech.waiver, async (_body, context, req) => await serviceOf(context).techWaiver(req))),
  ]
}
