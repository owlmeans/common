import type { RefedEntrypointHandler } from '@owlmeans/server-entrypoint'
import type { ApiConfig } from '@owlmeans/api-config'
import { advertisedConfig } from '@owlmeans/api-config'
import { handleRequest } from '@owlmeans/server-api'

export const advertise: RefedEntrypointHandler<ApiConfig> = handleRequest(async (_, ctx) => {
  return advertisedConfig(ctx.cfg) as ApiConfig
})
