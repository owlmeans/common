import { i18nHelper } from '@owlmeans/i18n'
import { buttons } from './consts.local.js'

for (const [language, values] of Object.entries(buttons)) {
  i18nHelper.addI18nLib(language, 'client-panel', values)
}
