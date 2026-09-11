import type { AllowanceRequest, AllowanceResponse, AuthCredentials, AuthToken } from '@owlmeans/auth'
import type { EntrypointProtocol } from '@owlmeans/entrypoint'
import { implementation } from '@owlmeans/server-entrypoint'
import { makeAuthModel } from '../model.js'
import type { AppContext, AppConfig } from '../types.js'
import { connection } from '@owlmeans/server-socket'

export const authenticationInit = (protocol: EntrypointProtocol<{ body: AllowanceRequest }, AllowanceResponse>) =>
  implementation(protocol, async (request, context) =>
  await makeAuthModel(context as AppContext<AppConfig>).init(request.body)
)

export const authenticate = (protocol: EntrypointProtocol<{ body: AuthCredentials }, AuthToken>) =>
  implementation(protocol, async (request, context) =>
  await makeAuthModel(context as AppContext<AppConfig>).authenticate(request.body)
)

export const rely = (protocol: EntrypointProtocol<{ query: Partial<AuthToken> }, undefined>) => connection(protocol,
  // @TODO Request will contain information is there requrest 
  // privileged or not (privileged request implies auth provider)
  async (conn, context, request) =>
    await makeAuthModel(context as AppContext<AppConfig>).rely(conn, request.auth)
)
