import { createLazyService } from '@owlmeans/context'
import type { GateService, AbstractRequest } from '@owlmeans/entrypoint'
import type { Auth } from '@owlmeans/auth'
import { hasPermission } from '@owlmeans/iam'
import { CapabilityRequired, ENTITLEMENT_GATE, parseEntitlementParam, capabilityOf } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import type { Config, Context, CapabilityGateOptions, EntityResolverOption } from './types.js'
import { log } from './log.js'
import { paymentAccessOf } from './access.js'
import { makeGateRequestScope } from './gate/request.js'
import type { GateEntity } from './gate/types.js'

/** An explicit `false` for the permission in the token denies, whatever the plan grants. */
const tokenDenies = (auth: Auth, param: string): boolean => {
  const { scope, permission } = parseEntitlementParam(param)
  return auth.permissions?.some(set =>
    (scope == null || set.scope === scope) && set.permissions?.[permission] === false,
  ) ?? false
}

const tokenGrants = (auth: Auth, param: string): boolean => {
  const { scope, permission } = parseEntitlementParam(param)
  return hasPermission(auth, permission, scope != null ? { scope } : undefined)
}

/**
 * The capability gate (`ENTITLEMENT_GATE`): passes when the effective plan grants ANY of the
 * parameters (`[scope:]permission[>=n]`) and the token does not deny it. Fails closed — an unreadable
 * store refuses. Refuses with `CapabilityRequired`, an `AuthForbidden`.
 */
export const makeCapabilityGate = (
  alias: string = ENTITLEMENT_GATE, opts?: CapabilityGateOptions,
): GateService => {
  const service = createLazyService<GateService>(alias, {
    assert: async (req, _, params) => {
      await service.ready()
      const ctx = service.assertCtx<Config, Context>() as unknown as ApiContext
      const { auth, entityId } = makeGateRequestScope(req).gateEntityOf(opts)
      const list = (Array.isArray(params) ? params : [params]).filter(param => typeof param === 'string')

      let view
      try {
        view = await paymentAccessOf(ctx).entitlements().entitlements(entityId)
      } catch (error) {
        log.error('Capability gate cannot resolve entitlements', { entityId, error })
        throw new CapabilityRequired(list)
      }
      if (opts?.productSkus != null && !opts.productSkus.includes(view.plan.productSku)) {
        throw new CapabilityRequired(list)
      }

      const allowed = list.some(param => capabilityOf(view, param) && !tokenDenies(auth, param)
        && (opts?.requirePermission !== true || tokenGrants(auth, param)))
      if (!allowed) {
        throw new CapabilityRequired(list)
      }
    },
  })

  return service
}

/** The capability gate under its historical name. */
export const makeEntitlementGate = makeCapabilityGate

/** @deprecated compat:factory-refactor — use `makeGateRequestScope(req).gateEntityOf(…)` */
export const gateEntityOf = (req: AbstractRequest, opts?: EntityResolverOption): GateEntity =>
  makeGateRequestScope(req).gateEntityOf(opts)
