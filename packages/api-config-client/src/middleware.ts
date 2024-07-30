import type { Middleware } from '@owlmeans/context'
import { MiddlewareType, MiddlewareStage, assertContext } from '@owlmeans/context'
import type { ClientModule } from '@owlmeans/client-module'
import type { ApiConfig } from '@owlmeans/api-config'
import { API_CONFIG } from '@owlmeans/api-config'
import { mergeConfig } from '@owlmeans/config'
import type { CommonConfig } from '@owlmeans/config'
import type { ClientContext, ClientConfig } from '@owlmeans/client-context'

export const apiConfigMiddleware: Middleware = {
  type: MiddlewareType.Context,
  stage: MiddlewareStage.Loading,
  apply: async (ctx) => {
    const context = assertContext<ClientConfig, ClientContext<ClientConfig>>(
      ctx as any, 'api-config-middleware'
    )
    const module = context.module<ClientModule<ApiConfig>>(API_CONFIG)
    if (context.cfg.primaryHost != null) {
      console.log('LOAD EXTERNAL CONFIG')
      module.route.route.host = context.cfg.primaryHost
      if (context.cfg.primaryPort != null) {
        module.route.route.port = context.cfg.primaryPort
      }
      try {
        const [config] = await module.call()
        const target: CommonConfig = context.cfg as unknown as CommonConfig
        mergeConfig(target, config as CommonConfig)
        console.log(JSON.stringify(target, null, 2))
      } catch (e) { 
        console.error(e)
      }
    }
  }
}
