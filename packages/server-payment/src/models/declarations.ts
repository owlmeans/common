import { PLAN_RECORD_TYPE, PlanDuration, PlanRankConflict } from '@owlmeans/payment'
import type { Config, PaymentPlan } from '../types.js'
import type { PlanDeclarationsModel } from './declarations/types.js'

export const makePlanDeclarationsModel = (record: Config): PlanDeclarationsModel => {
  const plans = (): PaymentPlan[] =>
    (record.records ?? []).filter(entry => entry.recordType === PLAN_RECORD_TYPE) as unknown as PaymentPlan[]

  const assertPlans = (): void => {
    const freeRanks = new Set<number>()
    const paidRanks = new Set<string>()
    for (const plan of plans()) {
      const rank = plan.rank ?? 0
      if (plan.free === true) {
        if (freeRanks.has(rank)) {
          throw new PlanRankConflict(`free:${rank}`)
        }
        freeRanks.add(rank)
      } else if (plan.duration !== PlanDuration.Consumable) {
        const key = `${plan.productSku}:${rank}`
        if (paidRanks.has(key)) {
          throw new PlanRankConflict(key)
        }
        paidRanks.add(key)
      }
    }
  }

  return { record, plans, assertPlans }
}
