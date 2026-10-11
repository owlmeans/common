
import { MARKETING_CONSENT_I18N } from './consts.js'
import { I18N_LANGUAGES } from './consts.local.js'
import { i18nHelper } from '@owlmeans/i18n'

Object.entries(I18N_LANGUAGES).forEach(([lng, data]) => {
  i18nHelper.addI18nLib(lng, MARKETING_CONSENT_I18N, data)
})
