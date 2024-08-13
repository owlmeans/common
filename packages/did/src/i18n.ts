import { addI18nLib } from '@owlmeans/i18n'

import en from './i18n/en.json'
import walletEn from './i18n/wallet-en.json'

addI18nLib('en', 'keys', en, { ns: 'did' })
addI18nLib('en', 'wallet', walletEn, { ns: 'did' })
