import { i18nHelper } from '@owlmeans/i18n'

import authEn from './i18n/auth-en.json' with { type: 'json' }
import authPl from './i18n/auth-pl.json' with { type: 'json' }
import authRu from './i18n/auth-ru.json' with { type: 'json' }
import authBe from './i18n/auth-be.json' with { type: 'json' }
import authUk from './i18n/auth-uk.json' with { type: 'json' }
import authEs from './i18n/auth-es.json' with { type: 'json' }
import authDe from './i18n/auth-de.json' with { type: 'json' }
import authFr from './i18n/auth-fr.json' with { type: 'json' }

i18nHelper.addI18nLib('en', 'auth', authEn)
i18nHelper.addI18nLib('pl', 'auth', authPl)
i18nHelper.addI18nLib('ru', 'auth', authRu)
i18nHelper.addI18nLib('be', 'auth', authBe)
i18nHelper.addI18nLib('uk', 'auth', authUk)
i18nHelper.addI18nLib('es', 'auth', authEs)
i18nHelper.addI18nLib('de', 'auth', authDe)
i18nHelper.addI18nLib('fr', 'auth', authFr)
