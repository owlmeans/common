import { createLazyService } from '@owlmeans/context'
import type { GateService } from '@owlmeans/entrypoint'
import { OIDC_GATE } from '@owlmeans/oidc'
import type { Config, Context } from './types.js'
import { AuthForbidden } from '@owlmeans/auth'
import { createGateModel } from './model/gate.js'
import { logger, logThrottle } from '@owlmeans/log'

const log = logger('server-oidc-rp')

/** A gate refusal: logged once a minute per route, reason and user — a hot route repeats it. */
const forbidden = (alias: string | undefined, reason: string, params: string[], userId?: string): AuthForbidden => {
  if (logThrottle(`access.forbidden:${alias ?? ''}:${reason}:${userId ?? ''}`, 60_000)) {
    log.warn('Access forbidden', { alias, reason, params, userId }, { event: 'access.forbidden' })
  }
  return new AuthForbidden(reason)
}

export const makeOidcGate = (alias: string = OIDC_GATE): GateService => {
  const service: GateService = createLazyService<GateService>(alias, {
    assert: async (req, _, params) => {
      await service.ready()
      const ctx = service.assertCtx<Config, Context>()

      if (req.auth == null) {
        throw forbidden(req.alias, 'auth', params)
      }

      const model = createGateModel(ctx)

      const permissions = await model.loadPermissions(req.auth, params)

      if (permissions.length < 1) {
        throw forbidden(req.alias, 'permission', params, req.auth.userId)
      }
    }
  })

  return service
}
