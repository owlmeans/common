import { describe, expect, test } from 'bun:test'
import en from '../src/i18n/en.json'
import pl from '../src/i18n/pl.json'
import ru from '../src/i18n/ru.json'
import be from '../src/i18n/be.json'
import uk from '../src/i18n/uk.json'
import es from '../src/i18n/es.json'
import de from '../src/i18n/de.json'

describe('web-payment localization', () => {
  const translations = { en, pl, ru, be, uk, es, de }

  test('ships all seven library languages with exact key parity', () => {
    const expected = Object.keys(en['amount-checkout']).sort()
    expect(Object.keys(translations).sort()).toEqual(['be', 'de', 'en', 'es', 'pl', 'ru', 'uk'])
    for (const messages of Object.values(translations)) {
      expect(Object.keys(messages['amount-checkout']).sort()).toEqual(expected)
      expect(Object.values(messages['amount-checkout']).every(value => value.trim().length > 0)).toBe(true)
    }
  })
})
