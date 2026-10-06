import type { AuthCredentials, AuthToken } from '@owlmeans/auth'
import type { EntrypointProtocol } from '@owlmeans/entrypoint'
import { handlers } from '@owlmeans/server-api'
import { makeAuthModel } from '../model.js'
import type { AppContext, AppConfig } from '../types.js'

const api = handlers<AppContext<AppConfig>>()

export const authenticate = (protocol: EntrypointProtocol<{ body: AuthCredentials }, AuthToken>) =>
  api.body(protocol, async (body, context) =>
  await makeAuthModel(context).authenticate(body)
)
