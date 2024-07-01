import type { AllowenceRequest, AuthCredentials } from '@owlmeans/auth'
import { handleBody } from '@owlmeans/server-api'
import type { ModuleHandler } from '@owlmeans/server-api'
import { makeAuthModel } from '../model'

export const authenticationInit: ModuleHandler = handleBody(
  async (ctx, payload: AllowenceRequest) => await makeAuthModel(ctx).init(payload)
)

export const authenticate: ModuleHandler = handleBody(
  async (ctx, payload: AuthCredentials) => await makeAuthModel(ctx).authenticate(payload)
)
