import type { AllowanceRequest, AuthCredentials } from '@owlmeans/auth'
import { handleBody } from '@owlmeans/server-api'
import { makeAuthModel } from '../model.js'
import type { RefedEntrypointHandler } from '@owlmeans/server-entrypoint'
import type { AppContext, AppConfig } from '../types.js'
import { handleConnection } from '@owlmeans/server-socket'

export const authenticationInit: RefedEntrypointHandler<AllowanceRequest> = handleBody(
  async (payload: AllowanceRequest, ctx) =>
    await makeAuthModel(ctx as AppContext<AppConfig>).init(payload)
)

export const authenticate: RefedEntrypointHandler<AuthCredentials> = handleBody(
  async (payload: AuthCredentials, ctx) =>
    await makeAuthModel(ctx as AppContext<AppConfig>).authenticate(payload)
)

export const rely: RefedEntrypointHandler<void> = handleConnection(
  // @TODO Request will contain information is there requrest 
  // privileged or not (privileged request implies auth provider)
  async (conn, ctx, req) =>
    await makeAuthModel(ctx as AppContext<AppConfig>).rely(conn, req.auth)
)
