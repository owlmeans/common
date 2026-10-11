import type { AuthToken } from '@owlmeans/auth'
import type { EntrypointProtocol } from '@owlmeans/entrypoint'
import { makeAuthModel } from '../model.js'
import type { AppContext, AppConfig } from '../types.js'
import { connection } from '@owlmeans/server-socket'

export const rely = (protocol: EntrypointProtocol<{ query: Partial<AuthToken> }, undefined>) => connection(protocol,
  // @TODO Request will contain information is there requrest 
  // privileged or not (privileged request implies auth provider)
  async (conn, context, request) =>
    await makeAuthModel(context as AppContext<AppConfig>).rely(conn, request.auth)
)
