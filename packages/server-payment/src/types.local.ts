import type { PaymentPlan, SyncedPriceOption } from './types.js'

export interface Distinct { collection: { distinct: (field: string, filter: object) => Promise<unknown[]> } }

export interface ResolvedPlan {
  plan: PaymentPlan
  unitAmount: number
  currency: string
  sourceUnitAmount: number
  sourceCurrency: string
  /** `currency_options` besides `currency`, sorted by currency. */
  options: SyncedPriceOption[]
}

export interface PluginReader { getConfigResource: (alias: string) => {
  get: (id: string) => Promise<unknown>
  load: (id: string) => Promise<unknown>
} }
