import { createLazyService } from '@owlmeans/context'
import type { GateService } from '@owlmeans/module'
import { OIDC_GATE } from '@owlmeans/oidc'
import type { Config, Context } from './types.js'
import { AuthForbidden } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import { extractAuthToken } from '@owlmeans/auth-common/utils'
import { OIDC_WRAPPED_TOKEN } from '@owlmeans/oidc'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { createGateModel } from './model/gate.js'

export const makeOidcGate = (alias: string = OIDC_GATE): GateService => {
  const service: GateService = createLazyService<GateService>(alias, {
    assert: async (req, _, params) => {
      await service.ready()
      const ctx = service.assertCtx<Config, Context>()

      const token = extractAuthToken(req, OIDC_WRAPPED_TOKEN)
      if (token == null) {
        throw new AuthForbidden('token')
      }

      const user = makeEnvelopeModel<Auth>(token, EnvelopeKind.Token).message()

      const model = createGateModel(ctx)

      const permissions = await model.loadPermissions(user, params)

      if (permissions.length < 1) {
        throw new AuthForbidden('permission')
      }
    }
  })

  return service
}
