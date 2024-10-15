import type { RefedModuleHandler } from '@owlmeans/server-module'
import { handleBody } from '@owlmeans/server-api'
import type { OIDCAuthInitParams } from '@owlmeans/oidc'

export const init: RefedModuleHandler = handleBody(async (_body: OIDCAuthInitParams, _ctx) => {
})
