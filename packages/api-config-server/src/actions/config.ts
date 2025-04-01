import type { RefedModuleHandler } from '@owlmeans/server-module'
import type { ApiConfig } from '@owlmeans/api-config'
import type { ServerConfig } from '@owlmeans/server-context'
import type { PluginConfig } from '@owlmeans/config'
import { notAdvertizedConfigKeys, allowedConfigRecords } from '@owlmeans/api-config'
import { handleRequest } from '@owlmeans/server-api'
import { PLUGINS } from '@owlmeans/config'
import { AppType, CONFIG_RECORD } from '@owlmeans/context'
import type { ConfigRecord } from '@owlmeans/context'

export const advertise: RefedModuleHandler<ApiConfig> = handleRequest(async (_, ctx) => {
  const apiConfig: ApiConfig = {
    debug: ctx.cfg.debug ?? {},
    brand: {},
    services: Object.fromEntries(
      Object.entries(ctx.cfg.services ?? {} as ServerConfig).map(([service, config]) => [
        service, {
          service: config.service,
          type: config.type,
          host: config.host,
          port: config.port,
          base: config.base
        }
      ])
    ),
    plugins: ((ctx.cfg as unknown as Record<string, PluginConfig[]>)[PLUGINS] ?? [])
      .filter((plugin: PluginConfig) => plugin.type === AppType.Frontend),
    [CONFIG_RECORD]: ((ctx.cfg as unknown as Record<string, ConfigRecord[]>)[CONFIG_RECORD] ?? []).filter(
      (record: ConfigRecord) => record.recordType != null && allowedConfigRecords.includes(record.recordType)
    ),
    ...(
      Object.fromEntries(
        Object.entries(ctx.cfg).filter(([key]) => ![
          'debug', 'services', PLUGINS, ...notAdvertizedConfigKeys
        ].includes(key))
      )
    ),
    ...("oidc" in ctx.cfg ? {
      oidc: {
        clientCookie: (ctx.cfg.oidc as { clientCookie: unknown }).clientCookie,
        providers: (ctx.cfg.oidc as { providers: Object[] }).providers?.map(
          provider => Object.fromEntries(Object.entries(provider)
            .filter(([key]) => !['secret', 'apiClientId'].includes(key)))
        ).filter(provider => provider.internal !== true),
      }
    } : {})
  }

  return apiConfig
})
