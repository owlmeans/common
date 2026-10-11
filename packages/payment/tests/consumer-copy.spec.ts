import { describe, expect, test } from 'bun:test'
import { LIB_NAMESPACE, SUPPORTED_LNGS, i18nHelper } from '@owlmeans/i18n'
import {
  ConsentKind, CONSUMER_RIGHTS_COPY_VERSION, CONSUMER_RIGHTS_RESOURCE, ConsumerRightsError,
  consumerCopyHelper,
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
        expect([lng, path, consumerCopyHelper.placeholdersOf(text).sort()]).toEqual([lng, path, consumerCopyHelper.placeholdersOf(en.get(path)!).sort()])
      }
    }
  })

  test('pins the statutory labels exactly', () => {
    for (const [lng, [withdraw, confirmWithdrawal, cancel, confirmCancel]] of Object.entries(STATUTORY)) {
      expect(consumerCopyHelper.legalLabelsOf(lng)).toEqual({
        withdrawal: { function: withdraw, confirm: confirmWithdrawal },
        cancellation: { function: cancel, confirm: confirmCancel },
      })
      expect(consumerCopyHelper.consumerText(lng, 'links.withdrawal-function')).toBe(withdraw)
      expect(consumerCopyHelper.consumerText(lng, 'links.cancellation')).toBe(cancel)
    }
  })

  test('carries the statutory verbs of the express request', () => {
    const vars = { trader: 'Trader Ltd', plan: 'Pro' }
    expect(consumerCopyHelper.consumerText('pl', 'performance-consent.request', vars)).toStartWith('Żądam i wyrażam wyraźną zgodę')
    expect(consumerCopyHelper.consumerText('pl', 'performance-consent.acknowledgement', vars)).toStartWith('Przyjmuję do wiadomości')
    expect(consumerCopyHelper.consumerText('pl', 'performance-consent.acknowledgement', vars)).toContain('utracę prawo odstąpienia od umowy')
    expect(consumerCopyHelper.consumerText('de', 'performance-consent.request', vars)).toStartWith('Ich verlange ausdrücklich und stimme ausdrücklich zu')
    expect(consumerCopyHelper.consumerText('de', 'performance-consent.acknowledgement', vars)).toMatch(/^Mir ist bekannt, dass mein Widerrufsrecht .* erlischt/)
    expect(consumerCopyHelper.consumerText('fr', 'performance-consent.request', vars)).toStartWith('Je demande expressément et j’accepte expressément')
    expect(consumerCopyHelper.consumerText('fr', 'performance-consent.acknowledgement', vars)).toStartWith('Je reconnais perdre mon droit de rétractation')
    for (const lng of LANGUAGES) {
      for (const context of [undefined, 'units']) {
        expect([lng, context, consumerCopyHelper.consumerText(lng, 'subscription-start.request', vars, context).split(' ').slice(0, 3)])
          .toEqual([lng, context, consumerCopyHelper.consumerText(lng, 'performance-consent.request', vars).split(' ').slice(0, 3)])
      }
    }
    for (const context of [undefined, 'units']) {
      expect(consumerCopyHelper.consumerText('pl', 'subscription-start.acknowledgement', vars, context)).toStartWith('Przyjmuję do wiadomości')
      expect(consumerCopyHelper.consumerText('de', 'subscription-start.acknowledgement', vars, context)).toStartWith('Mir ist bekannt')
      expect(consumerCopyHelper.consumerText('fr', 'subscription-start.acknowledgement', vars, context)).toStartWith('Je reconnais')
    }
  })

  test('the English statements are the approved masters', () => {
    expect(consumerCopyHelper.consentStatementOf('en', ConsentKind.Performance, { trader: 'OwlMeans' }).checkbox).toBe(
      'I expressly request and agree that OwlMeans starts performing the paid service — the AI work and the digital'
      + ' content it produces — now, before the withdrawal period ends. I acknowledge that for the credits I use, my'
      + ' right of withdrawal expires once that work has been performed, and that if I withdraw, only the credits I'
      + ' have not used are reimbursed.',
    )
    expect(consumerCopyHelper.consentStatementOf('en', ConsentKind.SubscriptionStart, { trader: 'OwlMeans', plan: 'Pro' })).toEqual({
      request: 'I expressly request and agree that OwlMeans starts the Pro services — including the AI work within the'
        + ' usage the plan includes — now, before the 14-day withdrawal period ends.',
      acknowledgement: 'I acknowledge that if I withdraw, I pay for the services provided until then, pro rata by the'
        + ' days elapsed, and everything else is reimbursed.',
      checkbox: 'I expressly request and agree that OwlMeans starts the Pro services — including the AI work within the'
        + ' usage the plan includes — now, before the 14-day withdrawal period ends. I acknowledge that if I withdraw, I'
        + ' pay for the services provided until then, pro rata by the days elapsed, and everything else is reimbursed.',
    })
    expect(consumerCopyHelper.consentStatementOf('en', ConsentKind.SubscriptionStart, { trader: 'OwlMeans', plan: 'Pro', context: 'units' }).checkbox).toBe(
      'I expressly request and agree that OwlMeans starts the Pro platform services now and performs the AI work paid'
      + ' with the included credits whenever I start it, before the 14-day withdrawal period ends. I acknowledge that'
      + ' if I withdraw, I pay for the platform services provided until then, pro rata by time, and that my right of'
      + ' withdrawal expires for the included credits I have used; everything else is reimbursed.',
    )
    expect(consumerCopyHelper.consumerText('en', 'email.start.rule')).toBe(
      'If you withdraw within the withdrawal period, you pay for the services provided until then, pro rata by the days'
      + ' elapsed; everything else is reimbursed.',
    )
    expect(consumerCopyHelper.consumerText('en', 'email.start.rule', {}, 'units')).toBe(
      'If you withdraw within the withdrawal period, you pay for the platform services provided until then, pro rata by'
      + ' time, and your right of withdrawal expires for the included credits you have used; everything else is reimbursed.',
    )
  })

  test('the checkbox is the request followed by the acknowledgement, in every language', () => {
    for (const lng of LANGUAGES) {
      for (const [kind, context] of [
        [ConsentKind.Performance, undefined], [ConsentKind.Performance, 'included'],
        [ConsentKind.SubscriptionStart, undefined], [ConsentKind.SubscriptionStart, 'units'],
      ] as const) {
        const statement = consumerCopyHelper.consentStatementOf(lng, kind, { trader: 'Trader Ltd', plan: 'Pro', context })
        expect([lng, kind, context, statement.checkbox])
          .toEqual([lng, kind, context, `${statement.request} ${statement.acknowledgement}`])
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
        expect([lng, path, consumerCopyHelper.consumerText(lng, path, vars).length <= 1200]).toEqual([lng, path, true])
      }
    }
  })

  test('the e-mail templates carry what a durable medium must', () => {
    const en = leaves(consumerCopyHelper.consumerRightsCopy('en'))
    expect(consumerCopyHelper.placeholdersOf(en.get('email.consent.body')!)).toEqual(['date', 'statement', 'purchases'])
    expect(consumerCopyHelper.placeholdersOf(en.get('email.consent.purchase')!)).toEqual(['contractRef', 'date', 'amount', 'deadline'])
    // `{{trader}}` is the trader's whole identity (legal name, address, e-mail — whatever is declared).
    expect(consumerCopyHelper.placeholdersOf(en.get('email.purchase.withdrawal-information')!)).toEqual(['trader', 'withdrawalFunction'])
    expect(consumerCopyHelper.placeholdersOf(en.get('email.purchase.model-form')!)).toEqual(['trader'])
    expect(en.get('email.purchase.model-form')).toContain('Model withdrawal form')
    // A review receipt promises the reimbursement itself, within the statutory 14 days.
    expect(en.get('email.withdrawal.review')).toContain('not later than 14 days')
    expect(consumerCopyHelper.consumerText('de', 'email.withdrawal.review')).toContain('unverzüglich und spätestens binnen vierzehn Tagen')
    expect(consumerCopyHelper.consumerText('fr', 'email.withdrawal.review')).toContain('sans retard excessif')
    expect(consumerCopyHelper.consumerText('pl', 'email.withdrawal.review')).toContain('niezwłocznie, a w każdym przypadku nie później niż 14 dni')
    // A deadline is shown as its last included day.
    expect(en.get('withdrawal.deadline')).toContain('until the end of {{deadline}}')
    expect(consumerCopyHelper.placeholdersOf(en.get('email.withdrawal.body')!)).toEqual(['date', 'name', 'contract', 'email'])
    expect(consumerCopyHelper.placeholdersOf(en.get('email.cancellation.effective')!)).toEqual(['effectiveAt'])
  })
})

describe('the included-credits variant of the performance consent', () => {
  const VARIANTS = ['title', 'intro', 'request', 'checkbox'] as const

  test('is present in all 8 languages, with the placeholders of its base text', async () => {
    for (const lng of LANGUAGES) {
      const copy = leaves(await load(lng))
      for (const key of VARIANTS) {
        const variant = copy.get(`performance-consent.${key}_included`)
        expect([lng, key, typeof variant === 'string' && variant.trim() !== '']).toEqual([lng, key, true])
        expect([lng, key, consumerCopyHelper.placeholdersOf(variant!).sort()])
          .toEqual([lng, key, consumerCopyHelper.placeholdersOf(copy.get(`performance-consent.${key}`)!).sort()])
        expect([lng, key, variant === copy.get(`performance-consent.${key}`)]).toEqual([lng, key, false])
      }
    }
  })

  test('its checkbox is its request followed by the base acknowledgement, in every language', () => {
    for (const lng of LANGUAGES) {
      const statement = consumerCopyHelper.consentStatementOf(lng, ConsentKind.Performance, { trader: 'Trader Ltd', context: 'included' })
      const base = consumerCopyHelper.consentStatementOf(lng, ConsentKind.Performance, { trader: 'Trader Ltd' })
      expect(statement.request).toBe(consumerCopyHelper.consumerText(lng, 'performance-consent.request_included', { trader: 'Trader Ltd' }))
      expect(statement.acknowledgement).toBe(base.acknowledgement)
      expect(statement.checkbox).toBe(`${statement.request} ${statement.acknowledgement}`)
      expect(statement.request).not.toBe(base.request)
    }
  })

  test('keeps the statutory opening of the base request in every language', () => {
    const vars = { trader: 'Trader Ltd' }
    for (const lng of LANGUAGES) {
      expect(consumerCopyHelper.consumerText(lng, 'performance-consent.request', vars, 'included').split(' ').slice(0, 3))
        .toEqual(consumerCopyHelper.consumerText(lng, 'performance-consent.request', vars).split(' ').slice(0, 3))
    }
    expect(consumerCopyHelper.consumerText('pl', 'performance-consent.request', vars, 'included')).toStartWith('Żądam i wyrażam wyraźną zgodę')
    expect(consumerCopyHelper.consumerText('de', 'performance-consent.request', vars, 'included')).toStartWith('Ich verlange ausdrücklich und stimme ausdrücklich zu')
    expect(consumerCopyHelper.consumerText('fr', 'performance-consent.request', vars, 'included')).toStartWith('Je demande expressément et j’accepte expressément')
  })

  test('the English variant is the approved master', () => {
    expect(consumerCopyHelper.consumerText('en', 'performance-consent.title', {}, 'included')).toBe('Use your topped-up credits now?')
    expect(consumerCopyHelper.consumerText('en', 'performance-consent.intro', { count: 1, deadline: 'October 8, 2026' }, 'included')).toBe(
      'Purchases still within the withdrawal period: 1. The last withdrawal period ends on October 8, 2026. The'
      + ' credit limits included in your plan are always used first; this applies to credits you topped up once those'
      + ' limits have run out.',
    )
    expect(consumerCopyHelper.consentStatementOf('en', ConsentKind.Performance, { trader: 'OwlMeans', context: 'included' }).checkbox).toBe(
      'I expressly request and agree that OwlMeans starts performing the paid service — the AI work and the digital'
      + ' content it produces — now, before the withdrawal period ends, paid with my topped-up credits once the credit'
      + ' limits included in my plan, which are always used first, have run out. I acknowledge that for the credits I'
      + ' use, my right of withdrawal expires once that work has been performed, and that if I withdraw, only the'
      + ' credits I have not used are reimbursed.',
    )
  })

  test('names the platform\'s credit vocabulary in every language: topped-up credits and credit limits', () => {
    const TERMS: Record<string, [RegExp, RegExp]> = {
      en: [/topped[- ]up/, /credit limits/i], pl: [/doładowan/, /limit(y|ów) kredytów/i],
      ru: [/пополненн/, /лимиты кредитов/i], be: [/папоўнен/, /ліміты крэдытаў/i], uk: [/поповнен/, /ліміти кредитів/i],
      es: [/recargad/, /límites de créditos/i], de: [/aufgeladenen Credits/, /Credit-Limits/],
      fr: [/rechargés/, /limites de crédits/i],
    }
    for (const [lng, [toppedUp, limits]] of Object.entries(TERMS)) {
      for (const key of ['intro', 'request', 'checkbox']) {
        const variant = consumerCopyHelper.consumerText(lng, `performance-consent.${key}`, { trader: 'x', count: 1, deadline: 'd' }, 'included')
        expect([lng, key, toppedUp.test(variant), limits.test(variant)]).toEqual([lng, key, true, true])
      }
      expect([lng, toppedUp.test(consumerCopyHelper.consumerText(lng, 'performance-consent.title', {}, 'included'))]).toEqual([lng, true])
    }
  })

  test('falls back to the base text where no variant exists, and without a context', () => {
    expect(consumerCopyHelper.consumerText('de', 'performance-consent.acknowledgement', {}, 'included'))
      .toBe(consumerCopyHelper.consumerText('de', 'performance-consent.acknowledgement'))
    expect(consumerCopyHelper.consumerText('en', 'performance-consent.confirm', {}, 'unknown-context')).toBe('Start now')
    expect(consumerCopyHelper.consumerText('en', 'withdrawal.function', {}, '')).toBe('Withdraw from contract here')
    expect(consumerCopyHelper.consentStatementOf('pl', ConsentKind.SubscriptionStart, { trader: 'x', plan: 'Pro', context: 'included' }))
      .toEqual(consumerCopyHelper.consentStatementOf('pl', ConsentKind.SubscriptionStart, { trader: 'x', plan: 'Pro' }))
    expect(consumerCopyHelper.consumerText('en', 'performance-consent.title')).toBe('Start using your credits now?')
  })

  test('a variant with a missing value names the variant', () => {
    expect(() => consumerCopyHelper.consumerText('en', 'performance-consent.request', {}, 'included'))
      .toThrow('copy:performance-consent.request_included:trader')
    expect(() => consumerCopyHelper.consumerText('en', 'performance-consent.nope', {}, 'included')).toThrow('copy:performance-consent.nope')
  })
})

describe('the subscription start statement — base (time only) and the units variant', () => {
  const VARIANTS = ['subscription-start.request', 'subscription-start.acknowledgement', 'subscription-start.checkbox', 'email.start.rule'] as const
  const SPLIT = { withdrawal: { components: [{ key: 'services', basis: 'time' as const, shareMinor: 1_000 }, { key: 'credits', basis: 'units' as const, shareMinor: 1_000 }] } }
  const TIME_ONLY = { withdrawal: { components: [{ key: 'services', basis: 'time' as const, shareMinor: 2_000 }] } }

  test('the units variant is present in all 8 languages, with the placeholders of its base text, and differs from it', async () => {
    for (const lng of LANGUAGES) {
      const copy = leaves(await load(lng))
      for (const path of VARIANTS) {
        const variant = copy.get(`${path}_units`)
        expect([lng, path, typeof variant === 'string' && variant.trim() !== '']).toEqual([lng, path, true])
        expect([lng, path, consumerCopyHelper.placeholdersOf(variant!).sort()]).toEqual([lng, path, consumerCopyHelper.placeholdersOf(copy.get(path)!).sort()])
        expect([lng, path, variant === copy.get(path)]).toEqual([lng, path, false])
      }
      // Only the statement and the mail's rule depend on the arithmetic.
      for (const key of ['title', 'intro', 'confirm', 'decline']) {
        expect([lng, key, copy.has(`subscription-start.${key}_units`)]).toEqual([lng, key, false])
      }
    }
  })

  test('the base names no included units and no expiring right; the variant names both', async () => {
    const en = leaves(await load('en'))
    for (const path of VARIANTS) {
      expect([path, /credits|expires/.test(en.get(path)!)]).toEqual([path, false])
    }
    for (const path of ['subscription-start.acknowledgement', 'subscription-start.checkbox', 'email.start.rule']) {
      expect([path, en.get(path)!.includes('pro rata by the days elapsed')]).toEqual([path, true])
    }
    expect(en.get('subscription-start.acknowledgement_units')).toContain('my right of withdrawal expires for the included credits')
    expect(en.get('email.start.rule_units')).toContain('your right of withdrawal expires for the included credits')
  })

  test('startContextOf: units exactly when a units component is declared', () => {
    expect(consumerCopyHelper.startContextOf(SPLIT)).toBe('units')
    expect(consumerCopyHelper.startContextOf({ withdrawal: { components: [SPLIT.withdrawal.components[1]] } })).toBe('units')
    expect(consumerCopyHelper.startContextOf(TIME_ONLY)).toBeUndefined()
    expect(consumerCopyHelper.startContextOf({})).toBeUndefined()
    expect(consumerCopyHelper.startContextOf({ withdrawal: { components: [] } })).toBeUndefined()
    expect(consumerCopyHelper.startContextOf(null)).toBeUndefined()
    expect(consumerCopyHelper.startContextOf(undefined)).toBeUndefined()
  })

  test('a plan renders its own statement through startContextOf, in every language', () => {
    for (const lng of LANGUAGES) {
      const vars = { trader: 'Trader Ltd', plan: 'Pro' }
      const split = consumerCopyHelper.consentStatementOf(lng, ConsentKind.SubscriptionStart, { ...vars, context: consumerCopyHelper.startContextOf(SPLIT) })
      const timeOnly = consumerCopyHelper.consentStatementOf(lng, ConsentKind.SubscriptionStart, { ...vars, context: consumerCopyHelper.startContextOf(TIME_ONLY) })
      expect(timeOnly).toEqual(consumerCopyHelper.consentStatementOf(lng, ConsentKind.SubscriptionStart, vars))
      expect(split.checkbox).toBe(consumerCopyHelper.consumerText(lng, 'subscription-start.checkbox_units', vars))
      expect(split.request).toBe(consumerCopyHelper.consumerText(lng, 'subscription-start.request_units', vars))
      expect(split.acknowledgement).toBe(consumerCopyHelper.consumerText(lng, 'subscription-start.acknowledgement_units', vars))
      expect([lng, split.checkbox === timeOnly.checkbox]).toEqual([lng, false])
      expect(split.request).toContain('Pro')
      expect(timeOnly.request).toContain('Pro')
    }
  })

  test('the units context falls back to the base where no variant exists', () => {
    const vars = { trader: 'Trader Ltd', plan: 'Pro' }
    expect(consumerCopyHelper.consumerText('de', 'subscription-start.title', vars, 'units')).toBe(consumerCopyHelper.consumerText('de', 'subscription-start.title', vars))
    expect(consumerCopyHelper.consumerText('fr', 'subscription-start.confirm', {}, 'units')).toBe('Continuer vers le paiement')
    expect(consumerCopyHelper.consumerText('en', 'email.start.subject', { plan: 'Pro' }, 'units')).toBe(consumerCopyHelper.consumerText('en', 'email.start.subject', { plan: 'Pro' }))
    expect(consumerCopyHelper.consentStatementOf('pl', ConsentKind.Performance, { trader: 'x', context: 'units' }))
      .toEqual(consumerCopyHelper.consentStatementOf('pl', ConsentKind.Performance, { trader: 'x' }))
    expect(() => consumerCopyHelper.consumerText('en', 'subscription-start.checkbox', { trader: 'x' }, 'units'))
      .toThrow('copy:subscription-start.checkbox_units:plan')
  })
})

describe('reading the copy', () => {
  test('any language, a regional tag reads its base language, an unknown one reads English', () => {
    expect(consumerCopyHelper.consumerText('de-DE', 'withdrawal.function')).toBe('Vertrag widerrufen')
    expect(consumerCopyHelper.consumerRightsCopy('it')).toEqual(consumerCopyHelper.consumerRightsCopy('en'))
  })

  test('an application override wins key by key; the rest stays', () => {
    i18nHelper.addI18nApp('es', CONSUMER_RIGHTS_RESOURCE, { spec: { probe: 'override' } }, { ns: LIB_NAMESPACE })
    expect(consumerCopyHelper.consumerText('es', 'spec.probe')).toBe('override')
    expect(consumerCopyHelper.consumerText('es', 'withdrawal.function')).toBe('Desistir del contrato aquí')
  })

  test('a missing text or value throws instead of sending a hole', () => {
    expect(() => consumerCopyHelper.consumerText('en', 'withdrawal.nope')).toThrow(ConsumerRightsError)
    expect(() => consumerCopyHelper.consumerText('en', 'withdrawal')).toThrow('copy:withdrawal')
    expect(() => consumerCopyHelper.consumerText('en', 'withdrawal.received', { date: 'x' })).toThrow('copy:withdrawal.received:email')
    expect(() => consumerCopyHelper.consentStatementOf('en', ConsentKind.SubscriptionStart, { trader: 'x' })).toThrow(ConsumerRightsError)
    expect(consumerCopyHelper.consumerText('en', 'withdrawal.received', { date: '2026-09-23 10:00', email: 'a@b.eu' }))
      .toBe('Your withdrawal was received on 2026-09-23 10:00 (UTC). An acknowledgement of receipt has been sent to a@b.eu.')
  })

  test('the copy has a version', () => {
    expect(CONSUMER_RIGHTS_COPY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })
})
