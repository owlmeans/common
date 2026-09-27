import { addI18nLib } from '@owlmeans/i18n'
import { MARKETING_CONSENT_I18N } from './consts.js'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }
import fr from './i18n/fr.json' with { type: 'json' }

/**
 * `screen.*`/`preferences.*` only — the `group.*`/`consent.*`/`link.*`/`errors.*` keys this
 * screen also renders come from `@owlmeans/marketing-consent`'s own `i18n.ts`, registered under
 * the SAME resource (`MARKETING_CONSENT_I18N` — see `../consts.js`) as a side effect of importing
 * that package, which this package always does.
 */
addI18nLib('en', MARKETING_CONSENT_I18N, en)
addI18nLib('pl', MARKETING_CONSENT_I18N, pl)
addI18nLib('ru', MARKETING_CONSENT_I18N, ru)
addI18nLib('be', MARKETING_CONSENT_I18N, be)
addI18nLib('uk', MARKETING_CONSENT_I18N, uk)
addI18nLib('es', MARKETING_CONSENT_I18N, es)
addI18nLib('de', MARKETING_CONSENT_I18N, de)
addI18nLib('fr', MARKETING_CONSENT_I18N, fr)
