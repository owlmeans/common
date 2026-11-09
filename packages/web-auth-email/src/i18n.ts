import { i18nHelper } from '@owlmeans/i18n'
import { AUTH_I18N, EMAIL_AUTH_I18N } from './consts.js'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }
import fr from './i18n/fr.json' with { type: 'json' }

import authEn from './i18n/auth/en.json' with { type: 'json' }
import authPl from './i18n/auth/pl.json' with { type: 'json' }
import authRu from './i18n/auth/ru.json' with { type: 'json' }
import authBe from './i18n/auth/be.json' with { type: 'json' }
import authUk from './i18n/auth/uk.json' with { type: 'json' }
import authEs from './i18n/auth/es.json' with { type: 'json' }
import authDe from './i18n/auth/de.json' with { type: 'json' }
import authFr from './i18n/auth/fr.json' with { type: 'json' }

i18nHelper.addI18nLib('en', EMAIL_AUTH_I18N, en)
i18nHelper.addI18nLib('pl', EMAIL_AUTH_I18N, pl)
i18nHelper.addI18nLib('ru', EMAIL_AUTH_I18N, ru)
i18nHelper.addI18nLib('be', EMAIL_AUTH_I18N, be)
i18nHelper.addI18nLib('uk', EMAIL_AUTH_I18N, uk)
i18nHelper.addI18nLib('es', EMAIL_AUTH_I18N, es)
i18nHelper.addI18nLib('de', EMAIL_AUTH_I18N, de)
i18nHelper.addI18nLib('fr', EMAIL_AUTH_I18N, fr)

/**
 * The chooser button's label, `login.method.email`, pushed into the `auth` library resource that
 * `@owlmeans/client-auth/login` fills with the rest of the sign-in screen — the bundles merge by
 * tier and priority, exactly as `@owlmeans/web-panel` adds `login.provider.*`.
 */
i18nHelper.addI18nLib('en', AUTH_I18N, authEn)
i18nHelper.addI18nLib('pl', AUTH_I18N, authPl)
i18nHelper.addI18nLib('ru', AUTH_I18N, authRu)
i18nHelper.addI18nLib('be', AUTH_I18N, authBe)
i18nHelper.addI18nLib('uk', AUTH_I18N, authUk)
i18nHelper.addI18nLib('es', AUTH_I18N, authEs)
i18nHelper.addI18nLib('de', AUTH_I18N, authDe)
i18nHelper.addI18nLib('fr', AUTH_I18N, authFr)
