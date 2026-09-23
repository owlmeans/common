import { describe, expect, test } from 'bun:test'
import { CancellationStatus, PurchaseKind, WithdrawalStatus } from '@owlmeans/payment'
import en from '../src/i18n/en.json'
import pl from '../src/i18n/pl.json'
import ru from '../src/i18n/ru.json'
import be from '../src/i18n/be.json'
import uk from '../src/i18n/uk.json'
import es from '../src/i18n/es.json'
import de from '../src/i18n/de.json'
import fr from '../src/i18n/fr.json'

type Messages = { [key: string]: string | Messages }

/** Every leaf as `branch.key` → message, however deep the resource nests. */
const leaves = (messages: Messages, prefix = ''): Map<string, unknown> => {
  const found = new Map<string, unknown>()
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (value != null && typeof value === 'object') {
      for (const [leaf, message] of leaves(value, path)) found.set(leaf, message)
    } else {
      found.set(path, value)
    }
  }
  return found
}

const placeholders = (message: string): string[] =>
  [...message.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)].map(match => match[1]).sort()

/**
 * What no payment text may say in any language (UCPD art. 6(1)(g)): the right of withdrawal
 * EXPIRES for what was used, and unused credits ARE reimbursed — nothing is "non-refundable".
 */
const FORBIDDEN = /non-?refundable|nicht erstattungsf|non rembours|bezzwrotn|no reembolsable|невозвратн|неповоротн|незваротн/i

describe('web-payment localization', () => {
  const translations: Record<string, Messages> = { en, pl, ru, be, uk, es, de, fr }
  const reference = leaves(en)

  test('ships all eight library languages with exact key parity at every depth', () => {
    expect(Object.keys(translations).sort()).toEqual(['be', 'de', 'en', 'es', 'fr', 'pl', 'ru', 'uk'])
    for (const key of [
      'amount-checkout.title', 'amount-checkout.above-limit', 'entitlement.status.renews-on', 'estimate.country-locked',
      'checkout-limit.note', 'checkout-limit.reason.per-purchase', 'checkout-limit.reason.window', 'checkout-limit.reason.hold',
      'consumer.show-in', 'consumer.review', 'consumer.receipt', 'withdrawal.status.refunded', 'cancellation.status.scheduled',
    ]) {
      expect({ key, present: reference.has(key) }).toEqual({ key, present: true })
    }
    for (const [lng, messages] of Object.entries(translations)) {
      const found = leaves(messages)
      expect({ lng, keys: [...found.keys()].sort() }).toEqual({ lng, keys: [...reference.keys()].sort() })
      for (const [key, message] of found) {
        expect({ lng, key, filled: typeof message === 'string' && message.trim().length > 0 })
          .toEqual({ lng, key, filled: true })
      }
    }
  })

  test('keeps the interpolation placeholders of every message', () => {
    for (const [lng, messages] of Object.entries(translations)) {
      for (const [key, message] of leaves(messages)) {
        expect({ lng, key, placeholders: placeholders(String(message)) })
          .toEqual({ lng, key, placeholders: placeholders(String(reference.get(key))) })
      }
    }
  })

  test('phrases every status and kind a receipt or a candidate can carry, in every language', () => {
    const required = [
      ...Object.values(WithdrawalStatus).map(status => `withdrawal.status.${status}`),
      ...Object.values(CancellationStatus).map(status => `cancellation.status.${status}`),
      ...Object.values(PurchaseKind).map(kind => `withdrawal.kind.${kind}`),
    ]
    expect(required).toContain('cancellation.status.review')
    for (const [lng, messages] of Object.entries(translations)) {
      const found = leaves(messages)
      for (const key of required) {
        expect({ lng, key, present: typeof found.get(key) === 'string' }).toEqual({ lng, key, present: true })
      }
    }
  })

  test('never calls anything non-refundable, in any language', () => {
    for (const [lng, messages] of Object.entries(translations)) {
      for (const [key, message] of leaves(messages)) {
        expect({ lng, key, forbidden: FORBIDDEN.test(String(message)) }).toEqual({ lng, key, forbidden: false })
      }
    }
  })
})
