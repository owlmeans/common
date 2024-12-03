import type { RefedModuleHandler } from '@owlmeans/server-module'
import { handleParams } from '@owlmeans/server-api'
import type { Context, WlEntityIdentifier, WlProvider } from '../types.js'
import { assertContext } from '@owlmeans/context'
import type { ProvideParams } from '@owlmeans/wled'

export const provide: RefedModuleHandler = handleParams<ProvideParams>(
  async (params, ctx) => {
    const context = assertContext(ctx, 'provide') as Context

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
