import { createLazyService } from '@owlmeans/context'
import type { AbstractRequest, GateService } from '@owlmeans/entrypoint'
import { AuthForbidden, entitySlugOf } from '@owlmeans/auth'
import type { Auth, PermissionSet } from '@owlmeans/auth'
import { ENTITLEMENT_GATE, hasEntitlement, SubscriptionStatus } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { subscriptions } from './utils.js'
import type { Config, Context } from './types.js'

export interface EntitlementGateOptions {
  productSkus?: string[]
  resolveEntity?: (req: AbstractRequest) => string | null
}

export const entitlementsOf = async (
  ctx: ApiContext, entityId: string, productSkus?: string[],
): Promise<PermissionSet[]> => {
  const { items } = await subscriptions(ctx).list({
    entityId, status: [SubscriptionStatus.Active, SubscriptionStatus.Trial], productSku: productSkus,
  }, { size: 0 })
  return items.flatMap(record => record.capabilities ?? [])
}

const defaultEntity = (req: AbstractRequest): string | null =>
  req.entity?.id ?? entitySlugOf(req.auth as Auth | undefined) ?? null

export const makeEntitlementGate = (
  alias: string = ENTITLEMENT_GATE, opts?: EntitlementGateOptions,
): GateService => {
  const service = createLazyService<GateService>(alias, {
    assert: async (req, _, params) => {
      await service.ready()
      const ctx = service.assertCtx<Config, Context>() as unknown as ApiContext
      if (req.auth == null) throw new AuthForbidden('auth')
      const entityId = (opts?.resolveEntity ?? defaultEntity)(req)
      if (entityId == null || entityId === '') throw new AuthForbidden('entity')

      let capabilities: PermissionSet[]
      try {
        capabilities = await entitlementsOf(ctx, entityId, opts?.productSkus)
      } catch (error) {
        console.error(`entitlement gate: cannot read subscriptions for "${entityId}"`, error)
        throw new AuthForbidden('entitlement')
      }
      if (!params.some(param => hasEntitlement(capabilities, param))) {
        throw new AuthForbidden('entitlement')
      }
    },
  })
  return service
}
