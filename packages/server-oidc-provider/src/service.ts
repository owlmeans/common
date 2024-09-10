import { assertContext, createService } from '@owlmeans/context'
import { DEFAULT_ALIAS } from './consts.js'
import { DEFAULT_PATH, INTERACTION } from '@owlmeans/oidc'
import type { Config, Context, OidcProviderService } from './types.js'
import Provider from 'oidc-provider'
import type { BasicRoute } from '@owlmeans/route'
import type { ClientModule } from '@owlmeans/client-module'
import { SEP } from '@owlmeans/route'
import { makeSecurityHelper } from '@owlmeans/config'
import { combineConfig } from './utils/config.js'

export const createOidcProviderService = (alias: string = DEFAULT_ALIAS): OidcProviderService => {
  const service: OidcProviderService = createService<OidcProviderService>(alias, {
    update: async api => {
      const context = assertContext<Config, Context>(service.ctx as Context, alias)
      const cfg = context.cfg.oidc
      console.log('Updating API service: ', alias, api.alias)

      const serviceRoute = context.cfg.services[
        cfg.authService ?? context.cfg.service
      ] as BasicRoute

      const helper = makeSecurityHelper<Config, Context>(context)
      const url = helper.makeUrl(serviceRoute, cfg.basePath ?? DEFAULT_PATH)

      const unsecure = context.cfg.security?.unsecure === false ? false : !url.startsWith('https')

      const oidc = new Provider(url, {
        ...combineConfig(context, unsecure),
        findAccount: async (_ctx, ...args) => {
          console.log('account', args)

          return {
            accountId: 'xxx',
            async claims(...args) {
              console.log('sub', args)

              return {
                sub: 'xxx',
                username: 'uuuuuu',
                name: 'Jon Doe',
                given_name: "Jon",
                family_name: "Doe",
                preferred_username: 'ooooo',
                nickname: 'nnnnn',
                profile: {
                  sub: 'xxx',
                  username: 'uuuuuu',
                  name: 'Jon Doe',
                  given_name: "Jon",
                  family_name: "Doe",
                  preferred_username: 'ooooo',
                  nickname: 'nnnnn',
                }
              }
            }
          }
        },
        interactions: {
          url: async (_, interaction) => {
            console.log('Figuring out interaction url for: ')
            console.log(JSON.stringify(interaction, null, 2))

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
        console.log('OIDC PROVIDER RESPONSE: ', ctx.response.body)
      })

      service.oidc = oidc
    },

    instance: () => {
      return service.oidc
    }
  }, _service => async () => {
    service.initialized = true
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