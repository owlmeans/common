import { createLazyService } from '@owlmeans/context'
import type { AbstractRequest, GateService } from '@owlmeans/entrypoint'
import { AuthForbidden, entitySlugOf } from '@owlmeans/auth'
import type { Auth, PermissionSet } from '@owlmeans/auth'
import { hasPermission } from '@owlmeans/iam'
import {
  CapabilityRequired, ENTITLEMENT_GATE, parseEntitlementParam, promoActive,
} from '@owlmeans/payment'
import { capabilityOf } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { resolveEffectivePlan } from './plan.js'
import { entitlements } from './utils.js'
import type { Config, Context } from './types.js'

export interface EntityResolverOption {
  /** The stable organization id a request acts for. Default: `req.entity.id`, else the token's entity. */
  resolveEntity?: (req: AbstractRequest) => string | null
}

export interface CapabilityGateOptions extends EntityResolverOption {
  /** Refuse unless the effective plan belongs to one of these products. */
  productSkus?: string[]
  /**
   * Also require the token to grant the permission (IAM `hasPermission`). Off by default: a
   * platform token carries no permissions, and the subscription is the authority.
   */
  requirePermission?: boolean
}

/** @deprecated use `CapabilityGateOptions` */
export type EntitlementGateOptions = CapabilityGateOptions

export const defaultEntity = (req: AbstractRequest): string | null =>
  req.entity?.id ?? entitySlugOf(req.auth as Auth | undefined) ?? null

/**
 * The capability sets an entity's effective plan grants now — sets behind a lapsed promo left out.
 * Empty when the plan is not of one of `productSkus`.
 */
export const entitlementsOf = async (
  ctx: ApiContext, entityId: string, productSkus?: string[],
): Promise<PermissionSet[]> => {
  const { plan, subscription } = await resolveEffectivePlan(ctx, entityId)
  if (productSkus != null && !productSkus.includes(plan.productSku)) {
    return []
  }
  const at = new Date()

  return (plan.capabilities ?? [])
    .filter(set => promoActive(set.promo, subscription?.createdAt, at))
    .map(({ promo: _promo, ...set }) => set)
}

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

/** Resolve the authenticated entity a gate asserts for, or refuse. */
export const gateEntityOf = (req: AbstractRequest, opts?: EntityResolverOption): { auth: Auth, entityId: string } => {
  if (req.auth == null) {
    throw new AuthForbidden('auth')
  }
  const entityId = (opts?.resolveEntity ?? defaultEntity)(req)
  if (entityId == null || entityId === '') {
    throw new AuthForbidden('entity')
  }

  return { auth: req.auth, entityId }
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
      const { auth, entityId } = gateEntityOf(req, opts)
      const list = (Array.isArray(params) ? params : [params]).filter(param => typeof param === 'string')

      let view
      try {
        view = await entitlements(ctx).entitlements(entityId)
      } catch (error) {
        console.error(`capability gate: cannot resolve entitlements of "${entityId}"`, error)
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
