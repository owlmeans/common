import type { RefedModuleHandler } from '@owlmeans/server-module'
import type { ApiConfig } from '@owlmeans/api-config'
import { notAvertizedConfigKeys } from '@owlmeans/api-config'
import { handleRequest } from '@owlmeans/server-api'
import { PLUGINS } from '@owlmeans/server-context'
import { AppType } from '@owlmeans/context'

export const advertise: RefedModuleHandler<ApiConfig> = handleRequest(async (_, ctx) => {
  const apiConfig: ApiConfig = {
    debug: ctx.cfg.debug,
    services: Object.fromEntries(
      Object.entries(ctx.cfg.services).map(([service, config]) => [
        service, {
          type: config.type,
          service: config.service,
          host: config.host,
          port: config.port,
          base: config.base
        }
      ])
    ),
    plugins: (ctx.cfg[PLUGINS] ?? []).filter(plugin => plugin.type === AppType.Frontend),
    ...(
      Object.fromEntries(
        Object.entries(ctx.cfg).filter(([key]) => ![
          'debug', 'services', PLUGINS , ...notAvertizedConfigKeys
        ].includes(key))
      )
    )
  }

  return apiConfig
})
