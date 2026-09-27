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
 * Group titles, consent statements and their descriptions under `lib:marketing-consent.*`, in the
 * 8 languages the OwlMeans consent packages share (en, pl, ru, be, uk, es, de, fr).
 *
 * A statement (`consent.<key>.label`) begins "I confirm that I agree to …" and a description
 * carries the policy link INSIDE its text as the `{{link}}` placeholder — the web screen splits the
 * translated string on it and draws the definition's own link there (`link.privacy` is the label
 * viable-style configurations point their links at).
 */
const LANGUAGES = { en, pl, ru, be, uk, es, de, fr }

Object.entries(LANGUAGES).forEach(([lng, data]) => {
  addI18nLib(lng, MARKETING_CONSENT_I18N, data)
})
