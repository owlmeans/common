import { addI18nLib } from '@owlmeans/i18n'
import en from './i18n/en.json'
import pl from './i18n/pl.json'
import ru from './i18n/ru.json'
import be from './i18n/be.json'
import uk from './i18n/uk.json'
import es from './i18n/es.json'
import de from './i18n/de.json'
import fr from './i18n/fr.json'

for (const [language, chunk] of Object.entries({ en, pl, ru, be, uk, es, de, fr })) {
  addI18nLib(language, 'permission-denied', chunk)
}
