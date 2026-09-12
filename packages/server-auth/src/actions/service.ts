import { handlers } from '@owlmeans/server-api'
import type { EntrypointProtocol } from '@owlmeans/entrypoint'
import type { AuthToken } from '@owlmeans/auth'
import { AuthServiceAppend } from '../types.js'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { assertContext } from '@owlmeans/context'

type Config = ServerConfig
type Context = ServerContext<Config> & AuthServiceAppend
const api = handlers<Context>()

export const authenticate = (protocol: EntrypointProtocol<{ body: AuthToken }, AuthToken>) =>
  api.request(protocol, async (request, context) => {
    const ctx = assertContext(context, 'authenticate') as Context

    return await ctx.auth().authenticate(request.body)
  })
