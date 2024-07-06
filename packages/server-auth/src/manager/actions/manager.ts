import type { AllowanceRequest, AuthCredentials } from '@owlmeans/auth'
import { handleBody } from '@owlmeans/server-api'
import { makeAuthModel } from '../model'
import type { RefedModuleHandler } from '@owlmeans/server-module'

export const authenticationInit: RefedModuleHandler<AllowanceRequest> = handleBody(
  async (payload: AllowanceRequest, ctx) => await makeAuthModel(ctx).init(payload)
)

export const authenticate: RefedModuleHandler<AuthCredentials> = handleBody(
  async (payload: AuthCredentials, ctx) => await makeAuthModel(ctx).authenticate(payload)
)
