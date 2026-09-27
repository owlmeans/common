import { addI18nLib } from '@owlmeans/i18n'
import { CONSUMER_RIGHTS_RESOURCE } from './consts.js'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }
import fr from './i18n/fr.json' with { type: 'json' }

import errorsEn from './i18n/errors/en.json' with { type: 'json' }
import errorsPl from './i18n/errors/pl.json' with { type: 'json' }
import errorsRu from './i18n/errors/ru.json' with { type: 'json' }
import errorsBe from './i18n/errors/be.json' with { type: 'json' }
import errorsUk from './i18n/errors/uk.json' with { type: 'json' }
import errorsEs from './i18n/errors/es.json' with { type: 'json' }
import errorsDe from './i18n/errors/de.json' with { type: 'json' }
import errorsFr from './i18n/errors/fr.json' with { type: 'json' }

import consumerEn from './i18n/consumer-rights/en.json' with { type: 'json' }
import consumerPl from './i18n/consumer-rights/pl.json' with { type: 'json' }
import consumerRu from './i18n/consumer-rights/ru.json' with { type: 'json' }
import consumerBe from './i18n/consumer-rights/be.json' with { type: 'json' }
import consumerUk from './i18n/consumer-rights/uk.json' with { type: 'json' }
import consumerEs from './i18n/consumer-rights/es.json' with { type: 'json' }
import consumerDe from './i18n/consumer-rights/de.json' with { type: 'json' }
import consumerFr from './i18n/consumer-rights/fr.json' with { type: 'json' }

addI18nLib('en', 'payment', en)
addI18nLib('pl', 'payment', pl)
addI18nLib('ru', 'payment', ru)
addI18nLib('be', 'payment', be)
addI18nLib('uk', 'payment', uk)
addI18nLib('es', 'payment', es)
addI18nLib('de', 'payment', de)
addI18nLib('fr', 'payment', fr)

/**
 * Every error type of this package under the shared `errors` resource, keyed by its type name —
 * where a panel's error lookup (`errors.<type>`) finds it.
 */
addI18nLib('en', 'errors', errorsEn)
addI18nLib('pl', 'errors', errorsPl)
addI18nLib('ru', 'errors', errorsRu)
addI18nLib('be', 'errors', errorsBe)
addI18nLib('uk', 'errors', errorsUk)
addI18nLib('es', 'errors', errorsEs)
addI18nLib('de', 'errors', errorsDe)
addI18nLib('fr', 'errors', errorsFr)

/**
 * The consumer-rights legal copy (`CONSUMER_RIGHTS_RESOURCE`): consent statements, statutory
 * labels, paygate texts, e-mail templates. Read it with `consumerRightsCopy` / `consumerText` —
 * any language, no i18next instance needed. An application overrides a text with
 * `addI18nApp(lng, CONSUMER_RIGHTS_RESOURCE, data, { ns: LIB_NAMESPACE })`.
 */
addI18nLib('en', CONSUMER_RIGHTS_RESOURCE, consumerEn)
addI18nLib('pl', CONSUMER_RIGHTS_RESOURCE, consumerPl)
addI18nLib('ru', CONSUMER_RIGHTS_RESOURCE, consumerRu)
addI18nLib('be', CONSUMER_RIGHTS_RESOURCE, consumerBe)
addI18nLib('uk', CONSUMER_RIGHTS_RESOURCE, consumerUk)
addI18nLib('es', CONSUMER_RIGHTS_RESOURCE, consumerEs)
addI18nLib('de', CONSUMER_RIGHTS_RESOURCE, consumerDe)
addI18nLib('fr', CONSUMER_RIGHTS_RESOURCE, consumerFr)
