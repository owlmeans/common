import type { AllowanceRequest, AuthCredentials } from '@owlmeans/auth'
import { handleBody } from '@owlmeans/server-api'
import { makeAuthModel } from '../model.js'
import type { RefedModuleHandler } from '@owlmeans/server-module'
import type { AppContext, AppConfig } from '../types.js'
import { handleConnection } from '@owlmeans/server-socket'

export const authenticationInit: RefedModuleHandler<AllowanceRequest> = handleBody(
  async (payload: AllowanceRequest, ctx) =>
    await makeAuthModel(ctx as AppContext<AppConfig>).init(payload)
)

export const authenticate: RefedModuleHandler<AuthCredentials> = handleBody(
  async (payload: AuthCredentials, ctx) =>
    await makeAuthModel(ctx as AppContext<AppConfig>).authenticate(payload)
)

export const rely: RefedModuleHandler<void> = handleConnection(
  // @TODO Request will contain information is there requrest 
  // privileged or not (privileged request implies auth provider)
  async (conn, ctx, req) =>
    await makeAuthModel(ctx as AppContext<AppConfig>).rely(conn, req.auth)
)
