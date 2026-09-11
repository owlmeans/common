import { handlers } from '@owlmeans/server-api'
import type { Context, WlEntityIdentifier, WlProvider } from '../types.js'
import type { ProvideParams } from '@owlmeans/wled'
import { wledEntrypoints } from '@owlmeans/wled'

export const provide = handlers<Context>().params(
  wledEntrypoints.provide,
  async (params: ProvideParams, context) => {

    const dns = context.cfg.wlIdentifierService == null ? undefined
      : context.service<WlEntityIdentifier>(context.cfg.wlIdentifierService)

    const entityId = dns != null
      ? await dns.identifyEntity(params.entity) ?? params.entity
      : params.entity

    const wl = Object.fromEntries(await Promise.all(
      context.cfg.wlProviders.map(async provider => {
        const srv = context.service<WlProvider>(provider)

        return [provider, await srv.provide(entityId)]
      })
    ))

    return wl
  }
)
