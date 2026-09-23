import { describe, expect, test } from 'bun:test'
import { addI18nApp, LIB_NAMESPACE, SUPPORTED_LNGS } from '@owlmeans/i18n'
import {
  ConsentKind, consentStatementOf, CONSUMER_RIGHTS_COPY_VERSION, CONSUMER_RIGHTS_RESOURCE, consumerRightsCopy,
  ConsumerRightsError, consumerText, legalLabelsOf, placeholdersOf,
} from '../src/index.js'
import type { CopyTree } from '../src/index.js'

const LANGUAGES = [...SUPPORTED_LNGS, 'fr'] as const

const load = async (lng: string): Promise<CopyTree> =>
  (await import(`../src/i18n/consumer-rights/${lng}.json`, { with: { type: 'json' } })).default

/** Every leaf as `path → text`. */
const leaves = (tree: CopyTree, prefix = ''): Map<string, string> => {
  const result = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (typeof value === 'string') {
      result.set(path, value)
    } else {
      leaves(value, path).forEach((text, leaf) => result.set(leaf, text))
    }
  }

  return result
}

/** Every branch as `path → sorted child keys`. */
const branches = (tree: CopyTree, prefix = '', result = new Map<string, string[]>()): Map<string, string[]> => {
  result.set(prefix, Object.keys(tree).sort())
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value !== 'string') {
      branches(value, prefix === '' ? key : `${prefix}.${key}`, result)
    }
  }

  return result
}

const STATUTORY: Record<string, [string, string, string, string]> = {
  en: ['Withdraw from contract here', 'Confirm withdrawal', 'Cancel contracts here', 'Cancel now'],
  de: ['Vertrag widerrufen', 'Widerruf bestätigen', 'Verträge hier kündigen', 'Jetzt kündigen'],
  fr: ['Renoncer au contrat ici', 'Confirmer la rétractation', 'Résilier votre contrat', 'Notification de la résiliation'],
  pl: ['Odstąp od umowy tutaj', 'Potwierdź odstąpienie od umowy', 'Wypowiedz umowę tutaj', 'Wypowiedz teraz'],
  es: ['Desistir del contrato aquí', 'Confirmar el desistimiento', 'Cancelar contratos aquí', 'Cancelar ahora'],
}

const FORBIDDEN = [
  /non[-\s]?refundable/i, /nicht\s+erstattungsf/i, /non\s+rembours/i, /bezzwrotn/i, /no\s+reembolsable/i,
  /невозвратн/i, /неповоротн/i, /незваротн/i,
]

describe('the consumer-rights copy', () => {
  test('ships all 8 languages with the same keys at every depth and no empty text', async () => {
    const en = await load('en')
    for (const lng of LANGUAGES) {
      const copy = await load(lng)
      expect([lng, [...branches(copy).entries()]]).toEqual([lng, [...branches(en).entries()]])
      expect([...leaves(copy).values()].every(text => text.trim() !== '')).toBe(true)
    }
  })

  test('every text carries exactly the placeholders of its English master', async () => {
    const en = leaves(await load('en'))
    for (const lng of LANGUAGES) {
      for (const [path, text] of leaves(await load(lng))) {
        expect([lng, path, placeholdersOf(text).sort()]).toEqual([lng, path, placeholdersOf(en.get(path)!).sort()])
      }
    }
  })

  test('pins the statutory labels exactly', () => {
    for (const [lng, [withdraw, confirmWithdrawal, cancel, confirmCancel]] of Object.entries(STATUTORY)) {
      expect(legalLabelsOf(lng)).toEqual({
        withdrawal: { function: withdraw, confirm: confirmWithdrawal },
        cancellation: { function: cancel, confirm: confirmCancel },
      })
      expect(consumerText(lng, 'links.withdrawal-function')).toBe(withdraw)
      expect(consumerText(lng, 'links.cancellation')).toBe(cancel)
    }
  })

  test('carries the statutory verbs of the express request', () => {
    const vars = { trader: 'Trader Ltd', plan: 'Pro' }
    expect(consumerText('pl', 'performance-consent.request', vars)).toStartWith('Żądam i wyrażam wyraźną zgodę')
    expect(consumerText('pl', 'performance-consent.acknowledgement', vars)).toStartWith('Przyjmuję do wiadomości')
    expect(consumerText('pl', 'performance-consent.acknowledgement', vars)).toContain('utracę prawo odstąpienia od umowy')
    expect(consumerText('de', 'performance-consent.request', vars)).toStartWith('Ich verlange ausdrücklich und stimme ausdrücklich zu')
    expect(consumerText('de', 'performance-consent.acknowledgement', vars)).toMatch(/^Mir ist bekannt, dass mein Widerrufsrecht .* erlischt/)
    expect(consumerText('fr', 'performance-consent.request', vars)).toStartWith('Je demande expressément et j’accepte expressément')
    expect(consumerText('fr', 'performance-consent.acknowledgement', vars)).toStartWith('Je reconnais perdre mon droit de rétractation')
    for (const lng of ['pl', 'de', 'fr']) {
      expect(consumerText(lng, 'subscription-start.request', vars).split(' ').slice(0, 3))
        .toEqual(consumerText(lng, 'performance-consent.request', vars).split(' ').slice(0, 3))
    }
  })

  test('the English statements are the approved masters', () => {
    expect(consentStatementOf('en', ConsentKind.Performance, { trader: 'OwlMeans' }).checkbox).toBe(
      'I expressly request and agree that OwlMeans starts performing the paid service — the AI work and the digital'
      + ' content it produces — now, before the withdrawal period ends. I acknowledge that for the credits I use, my'
      + ' right of withdrawal expires once that work has been performed, and that if I withdraw, only the credits I'
      + ' have not used are reimbursed.',
    )
    expect(consentStatementOf('en', ConsentKind.SubscriptionStart, { trader: 'OwlMeans', plan: 'Pro' }).checkbox).toBe(
      'I expressly request and agree that OwlMeans starts the Pro platform services now and performs the AI work paid'
      + ' with the included credits whenever I start it, before the 14-day withdrawal period ends. I acknowledge that'
      + ' if I withdraw, I pay for the platform services provided until then, pro rata by time, and that my right of'
      + ' withdrawal expires for the included credits I have used; everything else is reimbursed.',
    )
  })

  test('the checkbox is the request followed by the acknowledgement, in every language', () => {
    for (const lng of LANGUAGES) {
      for (const kind of [ConsentKind.Performance, ConsentKind.SubscriptionStart]) {
        const statement = consentStatementOf(lng, kind, { trader: 'Trader Ltd', plan: 'Pro' })
        expect(statement.checkbox).toBe(`${statement.request} ${statement.acknowledgement}`)
      }
    }
  })

  test('never calls anything non-refundable, in any language', async () => {
    for (const lng of LANGUAGES) {
      for (const [path, text] of leaves(await load(lng))) {
        for (const pattern of FORBIDDEN) {
          expect([lng, path, pattern.test(text)]).toEqual([lng, path, false])
        }
      }
    }
  })

  test('the paygate texts stay within 1200 characters with long URLs and values', () => {
    const url = `https://legal.example.com/${'very-long-path-segment/'.repeat(8)}billing-terms?lang=xx&version=2026-09-23`
    const vars = {
      billingTerms: url, withdrawalInformation: url, cancelUrl: url, price: '€1,234.56 plus VAT',
      product: 'prepaid credits for the platform account', country: 'PL',
    }
    for (const lng of LANGUAGES) {
      for (const path of [
        'checkout.terms-acceptance.in-scope', 'checkout.terms-acceptance.other', 'checkout.renewal.month',
        'checkout.renewal.year', 'checkout.renewal.after-submit', 'checkout.top-up',
      ]) {
        expect([lng, path, consumerText(lng, path, vars).length <= 1200]).toEqual([lng, path, true])
      }
    }
  })

  test('the e-mail templates carry what a durable medium must', () => {
    const en = leaves(consumerRightsCopy('en'))
    expect(placeholdersOf(en.get('email.consent.body')!)).toEqual(['date', 'statement', 'purchases'])
    expect(placeholdersOf(en.get('email.consent.purchase')!)).toEqual(['contractRef', 'date', 'amount', 'deadline'])
    // `{{trader}}` is the trader's whole identity (legal name, address, e-mail — whatever is declared).
    expect(placeholdersOf(en.get('email.purchase.withdrawal-information')!)).toEqual(['trader', 'withdrawalFunction'])
    expect(placeholdersOf(en.get('email.purchase.model-form')!)).toEqual(['trader'])
    expect(en.get('email.purchase.model-form')).toContain('Model withdrawal form')
    // A review receipt promises the reimbursement itself, within the statutory 14 days.
    expect(en.get('email.withdrawal.review')).toContain('not later than 14 days')
    expect(consumerText('de', 'email.withdrawal.review')).toContain('unverzüglich und spätestens binnen vierzehn Tagen')
    expect(consumerText('fr', 'email.withdrawal.review')).toContain('sans retard excessif')
    expect(consumerText('pl', 'email.withdrawal.review')).toContain('niezwłocznie, a w każdym przypadku nie później niż 14 dni')
    // A deadline is shown as its last included day.
    expect(en.get('withdrawal.deadline')).toContain('until the end of {{deadline}}')
    expect(placeholdersOf(en.get('email.withdrawal.body')!)).toEqual(['date', 'name', 'contract', 'email'])
    expect(placeholdersOf(en.get('email.cancellation.effective')!)).toEqual(['effectiveAt'])
  })
})

describe('reading the copy', () => {
  test('any language, a regional tag reads its base language, an unknown one reads English', () => {
    expect(consumerText('de-DE', 'withdrawal.function')).toBe('Vertrag widerrufen')
    expect(consumerRightsCopy('it')).toEqual(consumerRightsCopy('en'))
  })

  test('an application override wins key by key; the rest stays', () => {
    addI18nApp('es', CONSUMER_RIGHTS_RESOURCE, { spec: { probe: 'override' } }, { ns: LIB_NAMESPACE })
    expect(consumerText('es', 'spec.probe')).toBe('override')
    expect(consumerText('es', 'withdrawal.function')).toBe('Desistir del contrato aquí')
  })

  test('a missing text or value throws instead of sending a hole', () => {
    expect(() => consumerText('en', 'withdrawal.nope')).toThrow(ConsumerRightsError)
    expect(() => consumerText('en', 'withdrawal')).toThrow('copy:withdrawal')
    expect(() => consumerText('en', 'withdrawal.received', { date: 'x' })).toThrow('copy:withdrawal.received:email')
    expect(() => consentStatementOf('en', ConsentKind.SubscriptionStart, { trader: 'x' })).toThrow(ConsumerRightsError)
    expect(consumerText('en', 'withdrawal.received', { date: '2026-09-23 10:00', email: 'a@b.eu' }))
      .toBe('Your withdrawal was received on 2026-09-23 10:00 (UTC). An acknowledgement of receipt has been sent to a@b.eu.')
  })

  test('the copy has a version', () => {
    expect(CONSUMER_RIGHTS_COPY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })
})
