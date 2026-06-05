import { addI18nLib } from '@owlmeans/i18n'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }

addI18nLib('en', 'flow', en)
addI18nLib('pl', 'flow', pl)
addI18nLib('ru', 'flow', ru)
addI18nLib('be', 'flow', be)
addI18nLib('uk', 'flow', uk)
addI18nLib('es', 'flow', es)
addI18nLib('de', 'flow', de)
