import { implementation } from '@owlmeans/server-entrypoint'
import type { EntrypointProtocol } from '@owlmeans/entrypoint'
import type { AuthToken } from '@owlmeans/auth'
import { AuthServiceAppend } from '../types.js'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { assertContext } from '@owlmeans/context'

type Config = ServerConfig
type Context = ServerContext<Config> & AuthServiceAppend

export const authenticate = (protocol: EntrypointProtocol<{ body: AuthToken }, AuthToken>) =>
  implementation(protocol, async (request, context) => {
    const ctx = assertContext(context, 'authenticate') as Context

    return await ctx.auth().authenticate(request.body)
  })
