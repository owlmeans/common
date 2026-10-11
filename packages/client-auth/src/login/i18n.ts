

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }
import fr from './i18n/fr.json' with { type: 'json' }
import { i18nHelper } from '@owlmeans/i18n'

/**
 * The sign-in screen's copy, registered into the `auth` library resource.
 *
 * `_addI18n` PUSHES rather than replaces, so this coexists with `@owlmeans/web-client`'s own
 * `auth` registration (which owns `dispatcher.*` and `surrogate.*`) and the two merge by tier and
 * priority. Registering here rather than in a UI package is what lets the plain fallback screen
 * and every styled one read the same keys — so the seven-language rule holds on every path a user
 * can actually reach, not only the pretty one.
 */
i18nHelper.addI18nLib('en', 'auth', en)
i18nHelper.addI18nLib('pl', 'auth', pl)
i18nHelper.addI18nLib('ru', 'auth', ru)
i18nHelper.addI18nLib('be', 'auth', be)
i18nHelper.addI18nLib('uk', 'auth', uk)
i18nHelper.addI18nLib('es', 'auth', es)
i18nHelper.addI18nLib('de', 'auth', de)
i18nHelper.addI18nLib('fr', 'auth', fr)
