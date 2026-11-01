import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import type { EntrypointOptions } from '@owlmeans/entrypoint'
import { backend, frontend, route, RouteMethod } from '@owlmeans/route'
import { GUARD_ED25519 } from '@owlmeans/auth-common'
import {
  EMAIL_AUTH_API_PATH, EMAIL_AUTH_BASE, EMAIL_AUTH_OFFER, EMAIL_AUTH_OFFER_PATH, EMAIL_AUTH_OPTIONS,
  EMAIL_AUTH_PASSWORD, EMAIL_AUTH_PASSWORD_DECLINE, EMAIL_AUTH_PASSWORD_PIN, EMAIL_AUTH_PASSWORD_REMOVE,
  EMAIL_AUTH_PASSWORD_SET, EMAIL_AUTH_PASSWORD_STATUS, EMAIL_AUTH_PIN, EMAIL_AUTH_SIGN_IN, EMAIL_AUTH_TECH,
  EMAIL_AUTH_TECH_GATE, EMAIL_AUTH_TECH_PIN, EMAIL_AUTH_TECH_WAIVER,
} from './consts.js'
import {
  EmailEmptyRequestSchema, EmailPasswordPinRequestSchema, EmailPasswordRemoveRequestSchema,
  EmailPasswordSetRequestSchema, EmailPinRequestSchema, EmailSignInRequestSchema, EmailTechPinRequestSchema,
} from './schemas.js'
import type {
  EmailAuthEntrypointOptions, EmailAuthEntrypoints, EmailAuthOptionsView, EmailChallengeView, EmailEmptyRequest,
  EmailPasswordPinRequest, EmailPasswordRemoveRequest, EmailPasswordSetRequest, EmailPasswordStatusView,
  EmailPinRequest, EmailSignInRequest, EmailSignInView, EmailTechPinRequest, EmailTechPinView, EmailTechWaiverView,
} from './types.js'

/**
 * The e-mail sign-in surface:
 *
 * - the guest base (`opts.path`, default `/auth/email`, under `opts.parent`) carries NO guards —
 *   `options` GET `/options`, `pin` POST `/pin`, `signIn` POST `/sign-in`;
 * - `password` (`/password`, under the guest base or `opts.passwordParent`) acts on the caller's own
 *   account, so it needs the application's session: `opts.guards` (+ `opts.gate`) or a guarded
 *   `opts.passwordParent` — neither is a declaration error, not a runtime one. `status` GET `/`,
 *   `pin` POST `/pin`, `set` POST `/set`, `remove` POST `/remove`, `decline` POST `/decline`;
 * - `tech` (`/tech`, developer tooling) defaults to `GUARD_ED25519` + the `EMAIL_AUTH_TECH_GATE`
 *   gate: `pin` POST `/pin`, `waiver` POST `/waiver`;
 * - `offer`, the top-level sticky frontend screen of the post-sign-in password offer.
 */
export const makeEmailAuthProtocols = (opts: EmailAuthEntrypointOptions = {}): EmailAuthEntrypoints => {
  if (opts.passwordParent == null && opts.guards == null) {
    throw new SyntaxError('auth-email: the password routes need either a passwordParent or explicit guards')
  }

  const get = (alias: string, path: string, parent: EmailAuthEntrypoints['base']) =>
    route(alias, path, backend({ parent, method: RouteMethod.GET }))
  const post = (alias: string, path: string, parent: EmailAuthEntrypoints['base']) =>
    route(alias, path, backend({ parent, method: RouteMethod.POST }))

  const base = openProtocol(route(EMAIL_AUTH_BASE, opts.path ?? EMAIL_AUTH_API_PATH, backend({ parent: opts.parent })))

  const passwordOptions: EntrypointOptions = {
    ...(opts.guards != null ? { guards: opts.guards } : {}),
    ...(opts.gate != null ? { gate: opts.gate } : {}),
  }
  const passwordBase = openProtocol(
    route(EMAIL_AUTH_PASSWORD, '/password', backend({ parent: opts.passwordParent ?? base })), passwordOptions
  )

  const techBase = openProtocol(route(EMAIL_AUTH_TECH, '/tech', backend({ parent: base })), {
    guards: opts.techGuards ?? [GUARD_ED25519],
    gate: opts.techGate ?? { alias: EMAIL_AUTH_TECH_GATE },
  })

  return {
    base,
    options: protocol(get(EMAIL_AUTH_OPTIONS, '/options', base), contract(typed<EmailAuthOptionsView>())),
    pin: protocol(
      post(EMAIL_AUTH_PIN, '/pin', base),
      contract.request({ body: typed<EmailPinRequest>(EmailPinRequestSchema) }, typed<EmailChallengeView>())
    ),
    signIn: protocol(
      post(EMAIL_AUTH_SIGN_IN, '/sign-in', base),
      contract.request({ body: typed<EmailSignInRequest>(EmailSignInRequestSchema) }, typed<EmailSignInView>())
    ),
    password: {
      base: passwordBase,
      status: protocol(
        get(EMAIL_AUTH_PASSWORD_STATUS, '/', passwordBase), contract(typed<EmailPasswordStatusView>())
      ),
      pin: protocol(
        post(EMAIL_AUTH_PASSWORD_PIN, '/pin', passwordBase),
        contract.request(
          { body: typed<EmailPasswordPinRequest>(EmailPasswordPinRequestSchema) }, typed<EmailChallengeView>()
        )
      ),
      set: protocol(
        post(EMAIL_AUTH_PASSWORD_SET, '/set', passwordBase),
        contract.request(
          { body: typed<EmailPasswordSetRequest>(EmailPasswordSetRequestSchema) }, typed<EmailPasswordStatusView>()
        )
      ),
      remove: protocol(
        post(EMAIL_AUTH_PASSWORD_REMOVE, '/remove', passwordBase),
        contract.request(
          { body: typed<EmailPasswordRemoveRequest>(EmailPasswordRemoveRequestSchema) },
          typed<EmailPasswordStatusView>()
        )
      ),
      decline: protocol(
        post(EMAIL_AUTH_PASSWORD_DECLINE, '/decline', passwordBase),
        contract.request({ body: typed<EmailEmptyRequest>(EmailEmptyRequestSchema) }, typed<EmailPasswordStatusView>())
      ),
    },
    tech: {
      base: techBase,
      pin: protocol(
        post(EMAIL_AUTH_TECH_PIN, '/pin', techBase),
        contract.request({ body: typed<EmailTechPinRequest>(EmailTechPinRequestSchema) }, typed<EmailTechPinView>())
      ),
      waiver: protocol(
        post(EMAIL_AUTH_TECH_WAIVER, '/waiver', techBase),
        contract.request({ body: typed<EmailEmptyRequest>(EmailEmptyRequestSchema) }, typed<EmailTechWaiverView>())
      ),
    },
    // A top-level frontend screen, `sticky` so the router keeps it regardless of `cfg.service`
    // filtering — the same shape as marketing consent's screen.
    offer: openProtocol(
      route(EMAIL_AUTH_OFFER, opts.screen?.path ?? EMAIL_AUTH_OFFER_PATH, frontend({ parent: opts.screen?.parent })),
      { sticky: true }
    ),
  }
}
