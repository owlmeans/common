import { addI18nLib } from '@owlmeans/i18n'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }

addI18nLib('en', 'errors', en)
addI18nLib('pl', 'errors', pl)
addI18nLib('ru', 'errors', ru)
addI18nLib('be', 'errors', be)
addI18nLib('uk', 'errors', uk)
addI18nLib('es', 'errors', es)
addI18nLib('de', 'errors', de)
