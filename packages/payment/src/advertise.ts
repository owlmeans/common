import { CONFIG_RECORD } from '@owlmeans/context'
import { apiConfigPlugin, every } from '@owlmeans/api-config'
import { L10N_RECORD_TYPE, PLAN_RECORD_TYPE, PRODUCT_RECORD_TYPE } from './consts.js'

const advertisedRecordTypes = new Set([L10N_RECORD_TYPE, PLAN_RECORD_TYPE, PRODUCT_RECORD_TYPE])

apiConfigPlugin({
  allow: {
    [CONFIG_RECORD]: every(
      true,
      value => value != null && typeof value === 'object'
        && advertisedRecordTypes.has((value as { recordType?: string }).recordType ?? '')
    ),
  },
})
