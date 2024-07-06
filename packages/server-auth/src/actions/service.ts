import type { RefedModuleHandler } from '@owlmeans/server-module'
import type { AuthToken } from '@owlmeans/auth'
import { handleBody } from '@owlmeans/server-api'
import type { ContextType } from '../utils/types.js'

export const authenticate: RefedModuleHandler<AuthToken> = handleBody(
  async (payload: AuthToken, ctx) => {
    const context = ctx as unknown as ContextType
    return await context.auth().authenticate(payload)
  }
)
