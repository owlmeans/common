import { CONFIG_RECORD } from '@owlmeans/context'
import { apiConfigPlugin, every } from '@owlmeans/api-config'
import { L10N_RECORD_TYPE, PLAN_RECORD_TYPE, PRICING_POLICY_RECORD_TYPE, PRODUCT_RECORD_TYPE } from './consts.js'

/**
 * The pricing policy record carries only flags and TTLs (never a Stripe secret, an API version, or
 * a migration switch — those stay in a backend-only plugin), so advertising it to the browser is
 * safe.
 */
const advertisedRecordTypes = new Set([
  L10N_RECORD_TYPE, PLAN_RECORD_TYPE, PRODUCT_RECORD_TYPE, PRICING_POLICY_RECORD_TYPE,
])

apiConfigPlugin({
  allow: {
    [CONFIG_RECORD]: every(
      true,
      value => value != null && typeof value === 'object'
        && advertisedRecordTypes.has((value as { recordType?: string }).recordType ?? '')
    ),
  },
})
