import { addI18nLib } from '@owlmeans/i18n'

import authEn from './i18n/auth-en.json' with { type: 'json' }
import authPl from './i18n/auth-pl.json' with { type: 'json' }
import authRu from './i18n/auth-ru.json' with { type: 'json' }
import authBe from './i18n/auth-be.json' with { type: 'json' }
import authUk from './i18n/auth-uk.json' with { type: 'json' }
import authEs from './i18n/auth-es.json' with { type: 'json' }
import authDe from './i18n/auth-de.json' with { type: 'json' }

addI18nLib('en', 'auth', authEn)
addI18nLib('pl', 'auth', authPl)
addI18nLib('ru', 'auth', authRu)
addI18nLib('be', 'auth', authBe)
addI18nLib('uk', 'auth', authUk)
addI18nLib('es', 'auth', authEs)
addI18nLib('de', 'auth', authDe)
