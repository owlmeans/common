import { createService } from '@owlmeans/context'
import type { Config, Context, OidcGuard, OidcGuardOptions, WrappedOIDCService } from './types.js'
import { OIDC_GUARD, OIDC_GUARD_CACHE, OIDC_WRAPPED_TOKEN, WRAPPED_OIDC } from './consts.js'
import type { Resource, ResourceRecord } from '@owlmeans/resource'
import type { AbstractRequest, AbstractResponse, CommonModule, GuardService } from '@owlmeans/module'
import { DEFAULT_GUARD, TOKEN_UPDATE } from '@owlmeans/auth-common'
import { AUTH_HEADER, type Auth } from '@owlmeans/auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { trust } from '@owlmeans/auth-common/utils'
import { TRUSTED } from '@owlmeans/config'
import { extractAuthToken } from '@owlmeans/auth-common/utils'
import { modules as oidcModules } from './modules.js'

export const makeOidcGuard = (opts?: OidcGuardOptions): OidcGuard => {
  const cache = (context: Context) => context.hasResource(opts?.cache ?? OIDC_GUARD_CACHE)
    ? context.resource<Resource<ResourceRecord>>(opts?.cache ?? OIDC_GUARD_CACHE)
    : null

  console.log(!!cache)

  const [cogurad] = Array.isArray(opts?.coguards) ? opts.coguards : [opts?.coguards ?? DEFAULT_GUARD]

  const guard: OidcGuard = createService<OidcGuard>(OIDC_GUARD, {
    // Client side

    // get token() {
    //   const ctx = guard.assertCtx<Config, Context>()
    //   if (!ctx.hasService(cogurad)) {
    //     return undefined
    //   }

    //   // @TODO Make some custom implementation if required.
    //   // Cause it won't work on the back. And it's likely that
    //   // we will need it soon.
    //   const auth = ctx.service<GuardService>(cogurad)
    //   return auth.token
    // },

    authenticated: async req => {
      const ctx = guard.assertCtx()
      // @TODO Make some custom implementation if required.
      // We try to rely on some centeral auth service that operates all tokens.
      const auth = ctx.service<GuardService>(opts?.tokenService ?? cogurad)
      const token = await auth.authenticated(req)
      if (token != null) {
        const [type] = token.split(' ')
        if (type === OIDC_WRAPPED_TOKEN.toUpperCase()) {
          return token
        }
      }

      return null
    },

    // Server side
    match: async req => extractAuthToken(req, OIDC_WRAPPED_TOKEN) != null,

    handle: async <T>(req: AbstractRequest, res: AbstractResponse<Auth>) => {
      const authorization = extractAuthToken(req, OIDC_WRAPPED_TOKEN)
      if (authorization == null) {
        return false as T
      }

      const ctx = guard.assertCtx()
      const envelope = makeEnvelopeModel<Auth>(authorization, EnvelopeKind.Token)
      const trusted = await trust<Config, Context>(ctx, TRUSTED, ctx.cfg.alias ?? ctx.cfg.service)

      if (!await envelope.verify(trusted.key)) {
        return false as T
      }

      const token = extractAuthToken(req, OIDC_WRAPPED_TOKEN, false)!
      const updated = await wrapper(ctx).update({ token }, true)

      if (updated == null) {
        return false as T
      }

      if (updated.token !== token) {
        const [, newAuth] = updated.token.split(' ')
        const envelope = makeEnvelopeModel<Auth>(newAuth, EnvelopeKind.Token)

        res.responseProvider.header(TOKEN_UPDATE, updated.token)
        req.headers = { ...req.headers, [AUTH_HEADER]: updated.token }

        res.resolve(envelope.message())
      } else {
        res.resolve(envelope.message())
      }

      return true as T
    },
  })

  return guard
}

export const appendOidcGuard = <C extends Config, T extends Context<C>>(
  context: T, opts?: OidcGuardOptions
) => {
  context.registerService(makeOidcGuard(opts))

  return context
}

export const setupOidcGuard = (modules: CommonModule[], coguards?: string | string[]) => {
  modules.push(...oidcModules)
  coguards = Array.isArray(coguards) ? coguards : [coguards ?? DEFAULT_GUARD]

  modules.forEach(module => {
    if (module.guards != null && !module.guards.includes(OIDC_GUARD)
      && module.guards.some(guard => coguards.includes(guard))) {
      module.guards.unshift(OIDC_GUARD)
    }
  })
}

const wrapper = (context: Context): WrappedOIDCService =>
  context.hasService(WRAPPED_OIDC)
    ? context.service(WRAPPED_OIDC)
    : { update: async token => token } as WrappedOIDCService