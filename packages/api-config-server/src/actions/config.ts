import type { RefedModuleHandler } from '@owlmeans/server-module'
import type { ApiConfig } from '@owlmeans/api-config'
import { notAvertizedConfigKeys } from '@owlmeans/api-config'
import { handleRequest } from '@owlmeans/server-api'

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
    ...(
      Object.fromEntries(
        Object.entries(ctx.cfg).filter(([key]) => ![
          'debug', 'services', ...notAvertizedConfigKeys
        ].includes(key))
      )
    )
  }

  return apiConfig
})
