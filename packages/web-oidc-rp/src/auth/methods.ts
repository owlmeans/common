import { DISPATCHER } from '@owlmeans/auth'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import {
  DEFAULT_METHOD_ORDER, LoginOutcome, LOGIN_METHOD_QUERY, LOGIN_SERVICE, enterOidcAuthorization,
} from '@owlmeans/client-auth/login'
import { FlowStepMissconfigured, UnknownFlow } from '@owlmeans/flow'
import type { LoginMethod, LoginMethodSource, LoginService } from '@owlmeans/client-auth/login'
import type { FlowService } from '@owlmeans/client-flow'
import { DEFAULT_ALIAS as FLOW_SERVICE } from '@owlmeans/client-flow'
import type { OidcProviderConfig, WithSharedConfig } from '@owlmeans/oidc'
import { DEFAULT_ALIAS, OIDC_LOGIN_METHOD } from '../consts.js'
import type { OidcAuthService } from '../types.js'

/**
 * Which of the configured providers this application may actually offer.
 *
 * `restrictedProviders` is the existing contract and is honoured exactly as the server honours it:
 * `false` means an identity provider may not be used at all, `true` means only the default one,
 * and a list is an allow-list. `internal` providers are for machine use and are never a choice.
 */
const offerable = (cfg: WithSharedConfig['oidc'] | undefined): OidcProviderConfig[] => {
  const providers = (cfg?.providers ?? []).filter(provider => provider.internal !== true
    && provider.hidden !== true)
  const restricted = cfg?.restrictedProviders

  if (restricted === false) {
    return []
  }
  if (restricted === true) {
    return providers.filter(provider => provider.def === true)
  }
  if (Array.isArray(restricted)) {
    return providers.filter(provider =>
      restricted.includes(provider.entityId ?? provider.service ?? provider.clientId))
  }

  return providers
}

/**
 * The identity providers this application is federated with, as sign-in methods.
 *
 * When the configuration names none — which is the ordinary case for a generated application,
 * whose browser never receives a provider list because `oidc` is not advertised by the api-config
 * server — this still yields ONE generic method, so the screen has something to offer and the
 * server's own default-provider selection decides which issuer it reaches. Yielding nothing there
 * would leave a perfectly working application with an empty sign-in screen.
 */
export const oidcMethodSource: LoginMethodSource = {
  alias: 'oidc-providers',

  list: ctx => {
    const cfg = (ctx.context.cfg as unknown as WithSharedConfig).oidc
    const providers = offerable(cfg)

    const start = (id: string, params: Record<string, string>) =>
      async (methodCtx: typeof ctx): Promise<LoginOutcome> => {
        const login = methodCtx.context.service<LoginService>(LOGIN_SERVICE)

        // Framed, and not yet one window up: the window has to be opened INSIDE this click, so
        // nothing may be awaited first. The choice travels with it and the surrogate re-runs the
        // method itself, one window up, where the round trip can actually complete.
        if (methodCtx.env.embedded && !methodCtx.env.surrogate) {
          const dispatcher = methodCtx.context.entrypoint<ClientEntrypoint>(DISPATCHER).getPath()

          return await login.begin({
            url: `${dispatcher}?${LOGIN_METHOD_QUERY}=${encodeURIComponent(id)}`,
          })
        }

        const oidc = methodCtx.context.service<OidcAuthService>(DEFAULT_ALIAS)
        const flow = methodCtx.context.service<FlowService>(FLOW_SERVICE)
        await flow.ready()
        const model = await flow.state()
        if (model == null) {
          throw new UnknownFlow('login.method')
        }

        // The flow is booted at its FIRST step, and `authenticate` answers only from the step an
        // authorization request can be made from. Without this the call returns null and the
        // button does nothing, forever and silently.
        const redirect = await oidc.authenticate(enterOidcAuthorization(model), { ...params })

        if (redirect == null || redirect === '') {
          // A user asked to sign in and there is nowhere to send them. That is a failure, and it
          // has to be reported as one: returning `Passed` here left the screen sitting exactly as
          // it was, with no error, no navigation and nothing to diagnose.
          throw new FlowStepMissconfigured(`${OIDC_LOGIN_METHOD}:authorization-url`)
        }

        return await login.authorize(redirect)
      }

    if (providers.length < 1) {
      return [{
        id: OIDC_LOGIN_METHOD,
        i18nKey: 'oidc-default',
        icon: 'shield',
        order: 20,
        emphasis: 'primary',
        start: start(OIDC_LOGIN_METHOD, {}),
      }]
    }

    return providers.map((provider): LoginMethod => {
      const key = provider.entityId ?? provider.service ?? provider.clientId
      const id = `oidc:${key}`

      return {
        id,
        ...(provider.label != null ? { label: provider.label } : {}),
        i18nKey: 'oidc',
        icon: provider.icon ?? 'shield',
        order: provider.order ?? (provider.def === true ? 20 : DEFAULT_METHOD_ORDER),
        ...(provider.def === true ? { emphasis: 'primary' as const } : {}),
        params: provider.entityId != null ? { entity: provider.entityId } : {},
        start: start(id, provider.entityId != null ? { entity: provider.entityId } : {}),
      }
    })
  },
}
