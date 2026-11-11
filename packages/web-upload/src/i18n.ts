import { i18nHelper } from '@owlmeans/i18n'
import { WEB_UPLOAD_RESOURCE } from './consts.js'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }
import fr from './i18n/fr.json' with { type: 'json' }

i18nHelper.addI18nLib('en', WEB_UPLOAD_RESOURCE, en)
i18nHelper.addI18nLib('pl', WEB_UPLOAD_RESOURCE, pl)
i18nHelper.addI18nLib('ru', WEB_UPLOAD_RESOURCE, ru)
i18nHelper.addI18nLib('be', WEB_UPLOAD_RESOURCE, be)
i18nHelper.addI18nLib('uk', WEB_UPLOAD_RESOURCE, uk)
i18nHelper.addI18nLib('es', WEB_UPLOAD_RESOURCE, es)
i18nHelper.addI18nLib('de', WEB_UPLOAD_RESOURCE, de)
i18nHelper.addI18nLib('fr', WEB_UPLOAD_RESOURCE, fr)
