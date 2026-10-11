import { i18nHelper } from '@owlmeans/i18n'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }
import fr from './i18n/fr.json' with { type: 'json' }

i18nHelper.addI18nLib('en', 'socket', en)
i18nHelper.addI18nLib('pl', 'socket', pl)
i18nHelper.addI18nLib('ru', 'socket', ru)
i18nHelper.addI18nLib('be', 'socket', be)
i18nHelper.addI18nLib('uk', 'socket', uk)
i18nHelper.addI18nLib('es', 'socket', es)
i18nHelper.addI18nLib('de', 'socket', de)
i18nHelper.addI18nLib('fr', 'socket', fr)
