import { addI18nLib } from '@owlmeans/i18n'
import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }
import fr from './i18n/fr.json' with { type: 'json' }

/** The library resource (`lib` namespace) every interface string of this package lives in. */
export const WEB_PAYMENT_RESOURCE = 'web-payment'

addI18nLib('en', WEB_PAYMENT_RESOURCE, en)
addI18nLib('pl', WEB_PAYMENT_RESOURCE, pl)
addI18nLib('ru', WEB_PAYMENT_RESOURCE, ru)
addI18nLib('be', WEB_PAYMENT_RESOURCE, be)
addI18nLib('uk', WEB_PAYMENT_RESOURCE, uk)
addI18nLib('es', WEB_PAYMENT_RESOURCE, es)
addI18nLib('de', WEB_PAYMENT_RESOURCE, de)
addI18nLib('fr', WEB_PAYMENT_RESOURCE, fr)
