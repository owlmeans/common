import { CONFIG_RECORD } from '@owlmeans/context'
import { apiConfigPlugin, every } from '@owlmeans/api-config'
import { advertisedRecordTypes } from './consts.local.js'

apiConfigPlugin({
  allow: {
    [CONFIG_RECORD]: every(
      true,
      value => value != null && typeof value === 'object'
        && advertisedRecordTypes.has((value as { recordType?: string }).recordType ?? '')
    ),
  },
})
