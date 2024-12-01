import type { RefedModuleHandler } from '@owlmeans/server-module'
import { handleParams } from '@owlmeans/server-api'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { assertContext } from '@owlmeans/context'

type Config = ServerConfig
type Context = ServerContext<Config>

export const provide: RefedModuleHandler = handleParams(
  async (params, ctx) => {
    const context = assertContext(ctx, 'provide') as Context
    console.log(!!context, !!params)

    return params
  }
)
