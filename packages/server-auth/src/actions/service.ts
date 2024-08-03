import type { RefedModuleHandler } from '@owlmeans/server-module'
import type { AuthToken } from '@owlmeans/auth'
import { handleBody } from '@owlmeans/server-api'
import { AuthServiceAppend } from '../types.js'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { assertContext } from '@owlmeans/context'

type Config = ServerConfig
type Context = ServerContext<Config> & AuthServiceAppend

export const authenticate: RefedModuleHandler<AuthToken> = handleBody(
  async (payload: AuthToken, ctx) => {
    const context = assertContext(ctx, 'authenticate') as Context
    return await context.auth().authenticate(payload)
  }
)
