import { addI18nLib } from '@owlmeans/i18n'
import { PLANNING_I18N } from './consts.js'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }
import fr from './i18n/fr.json' with { type: 'json' }

/**
 * Labels under `lib:planning.*`, and every refusal under the shared `errors` resource keyed by its
 * type name — which is where a panel's error lookup (`errors.<type>`) finds them.
 */
const LANGUAGES = { en, pl, ru, be, uk, es, de, fr }

Object.entries(LANGUAGES).forEach(([lng, data]) => {
  addI18nLib(lng, PLANNING_I18N, data)
  addI18nLib(lng, 'errors', data.errors)
})
