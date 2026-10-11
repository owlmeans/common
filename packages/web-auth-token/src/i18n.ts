
import { AUTH_TOKEN_I18N } from './consts.js'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }
import fr from './i18n/fr.json' with { type: 'json' }
import { i18nHelper } from '@owlmeans/i18n'

i18nHelper.addI18nLib('en', AUTH_TOKEN_I18N, en)
i18nHelper.addI18nLib('pl', AUTH_TOKEN_I18N, pl)
i18nHelper.addI18nLib('ru', AUTH_TOKEN_I18N, ru)
i18nHelper.addI18nLib('be', AUTH_TOKEN_I18N, be)
i18nHelper.addI18nLib('uk', AUTH_TOKEN_I18N, uk)
i18nHelper.addI18nLib('es', AUTH_TOKEN_I18N, es)
i18nHelper.addI18nLib('de', AUTH_TOKEN_I18N, de)
i18nHelper.addI18nLib('fr', AUTH_TOKEN_I18N, fr)
