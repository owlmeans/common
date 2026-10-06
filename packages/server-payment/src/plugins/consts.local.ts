import { TaxType } from '@owlmeans/payment'
import type { DisputePhase } from '../types.js'

export const NON_SCALABLE_REASONS = new Set([
  'portion_product_exempt', 'portion_reduced_rated', 'portion_standard_rated', 'taxable_basis_reduced',
  'proportionally_rated',
])

export const TAX_TYPE_MAP: Readonly<Record<string, TaxType>> = Object.freeze({
  vat: TaxType.Vat, gst: TaxType.Gst, sales_tax: TaxType.SalesTax,
})

export const RESYNC_PAGE = 200

export const DISPUTE_PHASES: Record<string, DisputePhase> = {
  'charge.dispute.created': 'opened',
  'charge.dispute.funds_withdrawn': 'funds-withdrawn',
  'charge.dispute.funds_reinstated': 'funds-reinstated',
  'charge.dispute.closed': 'closed',
}

/** Stripe's limit on every `custom_text` message. */
export const CUSTOM_TEXT_MAX = 1200

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Countries where Stripe Tax cannot place a customer from the country alone (docs: tax/customer-locations). */
export const NEEDS_POSTAL_CODE = new Set(['US'])

export const NEEDS_POSTAL_CODE_OR_STATE = new Set(['CA', 'IN'])
