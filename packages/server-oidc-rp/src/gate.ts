import { createLazyService } from '@owlmeans/context'
import type { GateService } from '@owlmeans/module'
import { OIDC_GATE } from '@owlmeans/oidc'
import type { Config, Context } from './types.js'
import { AuthForbidden } from '@owlmeans/auth'
import { createGateModel } from './model/gate.js'

export const makeOidcGate = (alias: string = OIDC_GATE): GateService => {
  const service: GateService = createLazyService<GateService>(alias, {
    assert: async (req, _, params) => {
      await service.ready()
      const ctx = service.assertCtx<Config, Context>()

      if (req.auth == null) {
        throw new AuthForbidden('auth')
      }

      const model = createGateModel(ctx)

      const permissions = await model.loadPermissions(req.auth, params)

      if (permissions.length < 1) {
        throw new AuthForbidden('permission')
      }
    }
  })

  return service
}
