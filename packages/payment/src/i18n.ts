
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
import { i18nHelper } from '@owlmeans/i18n'

i18nHelper.addI18nLib('en', 'payment', en)
i18nHelper.addI18nLib('pl', 'payment', pl)
i18nHelper.addI18nLib('ru', 'payment', ru)
i18nHelper.addI18nLib('be', 'payment', be)
i18nHelper.addI18nLib('uk', 'payment', uk)
i18nHelper.addI18nLib('es', 'payment', es)
i18nHelper.addI18nLib('de', 'payment', de)
i18nHelper.addI18nLib('fr', 'payment', fr)

/**
 * Every error type of this package under the shared `errors` resource, keyed by its type name —
 * where a panel's error lookup (`errors.<type>`) finds it.
 */
i18nHelper.addI18nLib('en', 'errors', errorsEn)
i18nHelper.addI18nLib('pl', 'errors', errorsPl)
i18nHelper.addI18nLib('ru', 'errors', errorsRu)
i18nHelper.addI18nLib('be', 'errors', errorsBe)
i18nHelper.addI18nLib('uk', 'errors', errorsUk)
i18nHelper.addI18nLib('es', 'errors', errorsEs)
i18nHelper.addI18nLib('de', 'errors', errorsDe)
i18nHelper.addI18nLib('fr', 'errors', errorsFr)

/**
 * The consumer-rights legal copy (`CONSUMER_RIGHTS_RESOURCE`): consent statements, statutory
 * labels, paygate texts, e-mail templates. Read it with `consumerRightsCopy` / `consumerText` —
 * any language, no i18next instance needed. An application overrides a text with
 * `addI18nApp(lng, CONSUMER_RIGHTS_RESOURCE, data, { ns: LIB_NAMESPACE })`.
 */
i18nHelper.addI18nLib('en', CONSUMER_RIGHTS_RESOURCE, consumerEn)
i18nHelper.addI18nLib('pl', CONSUMER_RIGHTS_RESOURCE, consumerPl)
i18nHelper.addI18nLib('ru', CONSUMER_RIGHTS_RESOURCE, consumerRu)
i18nHelper.addI18nLib('be', CONSUMER_RIGHTS_RESOURCE, consumerBe)
i18nHelper.addI18nLib('uk', CONSUMER_RIGHTS_RESOURCE, consumerUk)
i18nHelper.addI18nLib('es', CONSUMER_RIGHTS_RESOURCE, consumerEs)
i18nHelper.addI18nLib('de', CONSUMER_RIGHTS_RESOURCE, consumerDe)
i18nHelper.addI18nLib('fr', CONSUMER_RIGHTS_RESOURCE, consumerFr)
