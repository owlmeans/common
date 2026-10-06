import { createLazyService } from '@owlmeans/context'
import type { GateService } from '@owlmeans/entrypoint'
import { LIMIT_GATE, LimitExhausted, LimitUnknown, type LimitParam, type LimitView, planLimitHelper } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { makeGateRequestScope } from './gate/request.js'
import type { Config, Context, LimitGateOptions } from './types.js'
import { log } from './log.js'
import { paymentAccessOf } from './access.js'

/**
 * The limit gate (`LIMIT_GATE`): passes when ANY `limit:<key>[>=n]` parameter has at least `n` left
 * in its current window. It never consumes — checking room and spending it are different moments,
 * and only the handler knows the work started. Malformed parameters and keys the plan does not
 * declare are skipped; a store error refuses. Refuses with `LimitExhausted` naming the first
 * declared key, an `AuthForbidden`.
 */
export const makeLimitGate = (alias: string = LIMIT_GATE, opts?: LimitGateOptions): GateService => {
  const service = createLazyService<GateService>(alias, {
    assert: async (req, _, params) => {
      await service.ready()
      const ctx = service.assertCtx<Config, Context>() as unknown as ApiContext
      const { entityId } = makeGateRequestScope(req).gateEntityOf(opts)
      const list = (Array.isArray(params) ? params : [params]).filter(param => typeof param === 'string')

      const parsed = list.map(planLimitHelper.parseLimitParam).filter((param): param is LimitParam => param != null)
      if (parsed.length === 0) {
        throw new LimitExhausted({ key: list[0] ?? 'unknown', used: 0, limit: 0 })
      }

      let refused: LimitView | null = null
      for (const param of parsed) {
        let state: LimitView
        try {
          state = await paymentAccessOf(ctx).entitlements().limitState(entityId, param.key)
        } catch (error) {
          if (!(error instanceof LimitUnknown)) {
            log.error('Limit gate cannot read a limit', { key: param.key, entityId, error })
          }
          continue
        }
        if (state.remaining >= param.atLeast) {
          return
        }
        refused ??= state
      }

      throw new LimitExhausted(refused != null
        ? { key: refused.key, used: refused.used, limit: refused.limit, resetsAt: refused.resetsAt }
        : { key: parsed[0].key, used: 0, limit: 0 })
    },
  })

  return service
}
