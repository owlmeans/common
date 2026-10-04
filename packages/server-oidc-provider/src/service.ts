import { assertContext, createService } from '@owlmeans/context'
import { DEFAULT_ALIAS, OIDC_ACCOUNT_SERVICE } from './consts.js'
import { DEFAULT_PATH, INTERACTION, INTERACTION_UID } from '@owlmeans/oidc'
import type { ServerResponse } from 'node:http'
import type { Config, Context, OidcAccountService, OidcAdapterService, OidcProviderService } from './types.js'
import Provider from 'oidc-provider'
import type { KoaContextWithOIDC } from 'oidc-provider'
import { logger } from '@owlmeans/log'
import type { BasicRoute } from '@owlmeans/route'
import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import { PARAM, SEP } from '@owlmeans/route'
import { makeSecurityHelper } from '@owlmeans/config'
import { combineConfig } from './utils/config.js'
import { makeInteractionPolicy } from './utils/policy.js'

const log = logger('server-oidc-provider')

/** An OIDC error the provider answers with a 4xx — the client's mistake, not the provider's. */
const isClientError = (error: unknown): boolean => {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' && status >= 400 && status < 500
}

/**
 * One provider error. The state dump carries ids only — never a token, code or secret the
 * request holds.
 */
const reportProviderError = (issuer: string, kind: string, ctx: KoaContextWithOIDC | undefined, error: Error): void => {
  const state = ctx?.oidc as unknown as {
    client?: { clientId?: string }, grant?: { jti?: string, accountId?: string, clientId?: string }
  } | undefined
  const data = { kind, issuer, clientId: state?.client?.clientId, code: (error as { error?: unknown }).error, error }
  if (isClientError(error)) {
    log.warn('OIDC provider refused a request', data)
  } else {
    log.error('OIDC provider error', data)
  }
  if (state != null && log.enabled('debug')) {
    log.debug('OIDC provider error state', {
      kind, fields: Object.getOwnPropertyNames(state),
      grant: state.grant != null
        ? { grantId: state.grant.jti, accountId: state.grant.accountId, clientId: state.grant.clientId } : undefined,
    })
  }
}

let _initializedOidc: Provider | undefined = undefined
export const createOidcProviderService = (alias: string = DEFAULT_ALIAS): OidcProviderService => {
  const service: OidcProviderService = createService<OidcProviderService>(alias, {
    update: async api => {
      const context = assertContext<Config, Context>(service.ctx as Context, alias)
      const cfg = context.cfg.oidc

      const serviceRoute = context.cfg.services[cfg.authService ?? context.cfg.service] as BasicRoute
      const helper = makeSecurityHelper<Config, Context>(context)
      const url = helper.makeUrl(serviceRoute, cfg.basePath ?? DEFAULT_PATH, { base: true })
      const unsecure = context.cfg.security?.unsecure === false ? false : !url.startsWith('https')

      const oidc = new Provider(url, {
        ...await combineConfig(context, unsecure),

        adapter: cfg.adapterService != null
          ? name => context.service<OidcAdapterService>(cfg.adapterService!).instance(name)
          : undefined,

        findAccount: async (kctx, id, token) => {
          const accountSrv = context.service<OidcAccountService>(
            cfg.accountService ?? OIDC_ACCOUNT_SERVICE
          )

          const clientId = (kctx as { oidc?: { client?: { clientId?: string } } })?.oidc?.client?.clientId
            ?? (token as { clientId?: string } | undefined)?.clientId

          return accountSrv.loadById(context, id, { clientId })
        },

        interactions: {
          policy: makeInteractionPolicy(),
          url: async (_, interaction) => {
            // The interaction screen is a FRONTEND route, and this is a server context — the
            // entrypoint registered here has no `url()` (that helper is attached by
            // `@owlmeans/client-entrypoint` only). So the URL is assembled the way `entrypointUrl`
            // does it in the browser: take the entrypoint's path, substitute the path params, then
            // qualify it with the address the entrypoint answers on — the FRONTEND service's, not
            // this one's.
            const entry = context.entrypoint<CommonEntrypoint>(INTERACTION)
            const path = entry.path().split(SEP)
              .map(part => part === `${PARAM}${INTERACTION_UID}` ? interaction.uid : part)
              .join(SEP)

            return helper.makeUrl(entry.address(), path)
          }
        }
      })

      oidc.proxy = cfg.behindProxy ?? unsecure
      const base = SEP + (cfg.basePath ?? DEFAULT_PATH)

      /**
       * Response headers the hardened defaults get wrong for an authorization endpoint.
       *
       * This runs as middleware, ahead of the provider in the same chain, and writes to the raw
       * response — deliberately, not as a Fastify `onSend` hook. `oidc.callback()` is a Koa
       * handler mounted through Middie: it ends the response itself, outside Fastify's reply
       * lifecycle, so `onSend` never fires for any route the provider answers and anything set
       * there silently never reaches the wire. The security defaults are already on the raw
       * response by this point (`@fastify/helmet` applies them in `onRequest`), so overriding
       * them here is what actually takes effect.
       */
      api.server.use(base, (_req: unknown, res: ServerResponse, next: () => void) => {
        // `Cross-Origin-Opener-Policy: same-origin` puts this document in a fresh browsing
        // context group, which severs `window.opener` **permanently** — navigating back to the
        // relying party afterwards does not restore it. Popup-based login is the standard way an
        // embedded application authenticates and the opener is its only channel home, so an
        // authorization endpoint must not be the thing that cuts it.
        res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none')

        // The provider posts its own interaction forms across origins; `form-action 'self'`
        // would block the submission.
        const csp = res.getHeader('Content-Security-Policy')
        if (typeof csp === 'string' && csp.includes("form-action 'self'")) {
          res.setHeader('Content-Security-Policy', csp.replace(/form-action 'self'/, 'form-action *'))
        }

        next()
      })

      api.server.use(base, oidc.callback())

      // Always attached: a provider error reaches the log — at `warn` when the client caused it
      // (an OIDC 4xx such as `invalid_grant`), at `error` otherwise; the request state at `debug`.
      oidc.on('grant.error', (ctx, error) => { reportProviderError(oidc.issuer, 'grant', ctx, error) })
      oidc.on('server_error', (ctx, error) => { reportProviderError(oidc.issuer, 'server', ctx, error) })
      oidc.on('userinfo.error', (ctx, error) => { reportProviderError(oidc.issuer, 'userinfo', ctx, error) })

      _initializedOidc = service.oidc = oidc
    },

    instance: () => {
      return service.oidc ?? (service.oidc = _initializedOidc!)
    },

    getInteraction: async id => {
      return await service.instance().Interaction.find(id) ?? null
    }
  })

  return service
}

export const appendOidcProviderService = <C extends Config, T extends Context<C>>(
  ctx: T, alias: string = DEFAULT_ALIAS
): T => {
  const service = createOidcProviderService(alias)
  const context = ctx as T

  context.registerService(service)

  return context
}
