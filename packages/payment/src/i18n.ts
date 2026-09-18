import { addI18nLib } from '@owlmeans/i18n'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }

import errorsEn from './i18n/errors/en.json' with { type: 'json' }
import errorsPl from './i18n/errors/pl.json' with { type: 'json' }
import errorsRu from './i18n/errors/ru.json' with { type: 'json' }
import errorsBe from './i18n/errors/be.json' with { type: 'json' }
import errorsUk from './i18n/errors/uk.json' with { type: 'json' }
import errorsEs from './i18n/errors/es.json' with { type: 'json' }
import errorsDe from './i18n/errors/de.json' with { type: 'json' }

addI18nLib('en', 'payment', en)
addI18nLib('pl', 'payment', pl)
addI18nLib('ru', 'payment', ru)
addI18nLib('be', 'payment', be)
addI18nLib('uk', 'payment', uk)
addI18nLib('es', 'payment', es)
addI18nLib('de', 'payment', de)

/**
 * Every error type of this package under the shared `errors` resource, keyed by its type name —
 * where a panel's error lookup (`errors.<type>`) finds it.
 */
addI18nLib('en', 'errors', errorsEn)
addI18nLib('pl', 'errors', errorsPl)
addI18nLib('ru', 'errors', errorsRu)
addI18nLib('be', 'errors', errorsBe)
addI18nLib('uk', 'errors', errorsUk)
addI18nLib('es', 'errors', errorsEs)
addI18nLib('de', 'errors', errorsDe)
