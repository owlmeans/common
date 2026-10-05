import { i18nHelper } from '@owlmeans/i18n'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }
import fr from './i18n/fr.json' with { type: 'json' }

i18nHelper.addI18nLib('en', 'client-panel-auth', en)
i18nHelper.addI18nLib('pl', 'client-panel-auth', pl)
i18nHelper.addI18nLib('ru', 'client-panel-auth', ru)
i18nHelper.addI18nLib('be', 'client-panel-auth', be)
i18nHelper.addI18nLib('uk', 'client-panel-auth', uk)
i18nHelper.addI18nLib('es', 'client-panel-auth', es)
i18nHelper.addI18nLib('de', 'client-panel-auth', de)
i18nHelper.addI18nLib('fr', 'client-panel-auth', fr)
