import type { AllowanceRequest, AuthCredentials } from '@owlmeans/auth'
import { handleBody } from '@owlmeans/server-api'
import { makeAuthModel } from '../model'
import type { RefedModuleHandler } from '@owlmeans/server-module'

export const authenticationInit: RefedModuleHandler<AllowanceRequest> = handleBody(
  async (ctx, payload: AllowanceRequest) => await makeAuthModel(ctx).init(payload)
)

export const authenticate: RefedModuleHandler<AuthCredentials> = handleBody(
  async (ctx, payload: AuthCredentials) => await makeAuthModel(ctx).authenticate(payload)
)
