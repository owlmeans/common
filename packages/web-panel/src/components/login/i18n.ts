import { i18nHelper } from '@owlmeans/i18n'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }
import fr from './i18n/fr.json' with { type: 'json' }
import { AUTH_RESOURCE } from './consts.local.js'

/**
 * The provider disclosure's copy (`login.provider.*`), registered into the SAME `auth` library
 * resource `@owlmeans/client-auth/login` fills with the rest of the sign-in screen.
 *
 * `_addI18n` pushes and the bundles are merged deeply by tier and priority, so this chunk lands
 * beside `login.title`/`login.terms.*` rather than replacing the `login` subtree. It lives here, not
 * in `client-auth`, because only this package renders the disclosure — and `client-auth` is pinned
 * exactly by applications that must not be pulled into a release for it.
 */
i18nHelper.addI18nLib('en', AUTH_RESOURCE, en)
i18nHelper.addI18nLib('pl', AUTH_RESOURCE, pl)
i18nHelper.addI18nLib('ru', AUTH_RESOURCE, ru)
i18nHelper.addI18nLib('be', AUTH_RESOURCE, be)
i18nHelper.addI18nLib('uk', AUTH_RESOURCE, uk)
i18nHelper.addI18nLib('es', AUTH_RESOURCE, es)
i18nHelper.addI18nLib('de', AUTH_RESOURCE, de)
i18nHelper.addI18nLib('fr', AUTH_RESOURCE, fr)
