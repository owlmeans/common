import { addI18nLib } from '@owlmeans/i18n'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }

import walletEn from './i18n/wallet-en.json' with { type: 'json' }
import walletPl from './i18n/wallet-pl.json' with { type: 'json' }
import walletRu from './i18n/wallet-ru.json' with { type: 'json' }
import walletBe from './i18n/wallet-be.json' with { type: 'json' }
import walletUk from './i18n/wallet-uk.json' with { type: 'json' }
import walletEs from './i18n/wallet-es.json' with { type: 'json' }
import walletDe from './i18n/wallet-de.json' with { type: 'json' }

addI18nLib('en', 'keys', en, { ns: 'did' })
addI18nLib('pl', 'keys', pl, { ns: 'did' })
addI18nLib('ru', 'keys', ru, { ns: 'did' })
addI18nLib('be', 'keys', be, { ns: 'did' })
addI18nLib('uk', 'keys', uk, { ns: 'did' })
addI18nLib('es', 'keys', es, { ns: 'did' })
addI18nLib('de', 'keys', de, { ns: 'did' })

addI18nLib('en', 'wallet', walletEn, { ns: 'did' })
addI18nLib('pl', 'wallet', walletPl, { ns: 'did' })
addI18nLib('ru', 'wallet', walletRu, { ns: 'did' })
addI18nLib('be', 'wallet', walletBe, { ns: 'did' })
addI18nLib('uk', 'wallet', walletUk, { ns: 'did' })
addI18nLib('es', 'wallet', walletEs, { ns: 'did' })
addI18nLib('de', 'wallet', walletDe, { ns: 'did' })
