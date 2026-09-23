import { CONFIG_RECORD } from '@owlmeans/context'
import { apiConfigPlugin, every } from '@owlmeans/api-config'
import {
  CONSUMER_RIGHTS_RECORD_TYPE, L10N_RECORD_TYPE, PLAN_RECORD_TYPE, PRICING_POLICY_RECORD_TYPE, PRODUCT_RECORD_TYPE,
} from './consts.js'

/**
 * The pricing policy record carries only flags and TTLs (never a Stripe secret, an API version, or
 * a migration switch — those stay in a backend-only plugin), so advertising it to the browser is
 * safe. The consumer-rights policy record carries only public links, territories and switches
 * (the mail options — sender, archive copy — stay in a backend-only plugin config), so the browser
 * renders the same links and switches the server enforces.
 */
const advertisedRecordTypes = new Set([
  L10N_RECORD_TYPE, PLAN_RECORD_TYPE, PRODUCT_RECORD_TYPE, PRICING_POLICY_RECORD_TYPE, CONSUMER_RIGHTS_RECORD_TYPE,
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
