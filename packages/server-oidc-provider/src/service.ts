import { assertContext, createService } from '@owlmeans/context'
import { DEFAULT_ALIAS, OIDC_ACCOUNT_SERVICE } from './consts.js'
import { DEFAULT_PATH, INTERACTION } from '@owlmeans/oidc'
import type { Config, Context, OidcAccountService, OidcAdapterService, OidcProviderService } from './types.js'
import Provider from 'oidc-provider'
import type { BasicRoute } from '@owlmeans/route'
import type { ClientModule } from '@owlmeans/client-module'
import { SEP } from '@owlmeans/route'
import { makeSecurityHelper } from '@owlmeans/config'
import { combineConfig } from './utils/config.js'

let _initializedOidc: Provider | undefined = undefined
export const createOidcProviderService = (alias: string = DEFAULT_ALIAS): OidcProviderService => {
  const service: OidcProviderService = createService<OidcProviderService>(alias, {
    update: async api => {
      const context = assertContext<Config, Context>(service.ctx as Context, alias)
      const cfg = context.cfg.oidc
      console.log('Updating API service: ', alias, api.alias)

      const serviceRoute = context.cfg.services[cfg.authService ?? context.cfg.service] as BasicRoute
      const helper = makeSecurityHelper<Config, Context>(context)
      const url = helper.makeUrl(serviceRoute, cfg.basePath ?? DEFAULT_PATH, { base: true })
      const unsecure = context.cfg.security?.unsecure === false ? false : !url.startsWith('https')

      console.log('~~~~ Provider URL we arranged: ', url)

      const oidc = new Provider(url, {
        ...await combineConfig(context, unsecure),

        adapter: cfg.adapterService != null
          ? name => context.service<OidcAdapterService>(cfg.adapterService!).instance(name)
          : undefined,

        findAccount: async (_, id, _token) => {
          const accountSrv = context.service<OidcAccountService>(
            cfg.accountService ?? OIDC_ACCOUNT_SERVICE
          )

          return accountSrv.loadById(context, id)
        },

        interactions: {
          url: async (_, interaction) => {
            if (context.cfg.debug?.all || context.cfg.debug?.oidc) {
              console.log('Figuring out interaction url for: ')
              console.log(JSON.stringify(interaction, null, 2))
            }

            const module = context.module<ClientModule>(INTERACTION)
            const [uri] = await module.call<string>({ params: { uid: interaction.uid } })
            return uri
          }
        }
      })

      oidc.proxy = cfg.behindProxy ?? unsecure
      const base = SEP + (cfg.basePath ?? DEFAULT_PATH)

      await api.server.use(base, oidc.callback())
      oidc.use(async (ctx, next) => {
        await next()
        const csp = ctx.response.headers['content-security-policy']
        if (csp != null) {
          // @TODO Make it a little bit nicer - preferably using helmet :)

          ctx.response.set('Content-Security-Policy', csp.replace(/form-action 'self'/, 'form-action *'))

          if (context.cfg.debug?.all || context.cfg.debug?.oidc) {
            console.log('Fixed content security policy: ', ctx.response.headers['content-security-policy'])
          }
        }
      })
      if (context.cfg.debug?.all || context.cfg.debug?.oidc) {
        oidc.use(async (ctx, next) => {
          if (context.cfg.debug.oidcServer) {
            console.log('OIDC PROVIDER REQUEST: ', ctx.headers, ctx.body)
          }
          await next()
          if (context.cfg.debug.oidcServer) {
            console.log('OIDC PROVIDER RESPONSE: ', ctx.response.headers, ctx.response.body)
            console.log('non deletable', ctx.response.headerSent)
          }
        })

        oidc.on('grant.error', (_, error) => {
          console.log(oidc.issuer)
          console.log('!!!! GRANT ERROR: ', error)
        })

        oidc.on('server_error', (ctx, error) => {
          console.log(oidc.issuer)
          console.log(Object.getOwnPropertyNames(ctx.oidc))
          console.log((ctx.oidc as any).grant)
          console.log('!!!! SERVER ERROR: ', error)
        })
      }

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
