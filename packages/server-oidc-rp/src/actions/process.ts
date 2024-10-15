import type { RefedModuleHandler } from '@owlmeans/server-module'
import { handleBody } from '@owlmeans/server-api'
import type { OIDCClientAuthPayload } from '@owlmeans/oidc'

export const authenticate: RefedModuleHandler = handleBody(async (_body: OIDCClientAuthPayload, _ctx) => {
})
