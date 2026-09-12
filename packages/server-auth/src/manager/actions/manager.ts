import type { AllowanceRequest, AllowanceResponse, AuthCredentials, AuthToken } from '@owlmeans/auth'
import type { EntrypointProtocol } from '@owlmeans/entrypoint'
import { handlers } from '@owlmeans/server-api'
import { makeAuthModel } from '../model.js'
import type { AppContext, AppConfig } from '../types.js'
import { connection } from '@owlmeans/server-socket'

const api = handlers<AppContext<AppConfig>>()

export const authenticationInit = (protocol: EntrypointProtocol<{ body: AllowanceRequest }, AllowanceResponse>) =>
  api.body(protocol, async (body, context) =>
  await makeAuthModel(context).init(body)
)

export const authenticate = (protocol: EntrypointProtocol<{ body: AuthCredentials }, AuthToken>) =>
  api.body(protocol, async (body, context) =>
  await makeAuthModel(context).authenticate(body)
)

export const rely = (protocol: EntrypointProtocol<{ query: Partial<AuthToken> }, undefined>) => connection(protocol,
  // @TODO Request will contain information is there requrest 
  // privileged or not (privileged request implies auth provider)
  async (conn, context, request) =>
    await makeAuthModel(context as AppContext<AppConfig>).rely(conn, request.auth)
)
