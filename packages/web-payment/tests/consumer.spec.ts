import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent, type Page } from '@owlmeans/test-ui'
import { closeHarness, harnessUrl } from './context.js'

const TIMEOUT = 60_000

afterAll(async () => {
  await closeBrowser()
  await closeHarness()
})

const open = async (query: string) => {
  const mounted = await mountComponent({ url: `${await harnessUrl()}?${query}` })
  // A case whose only content is a dialog (portalled) leaves an empty, zero-size <main>.
  await mounted.page.locator('main').waitFor({ state: 'attached' })
  return mounted
}

const text = async (page: Page, selector: string): Promise<string> =>
  (await page.locator(selector).first().innerText()).replace(/\s+/g, ' ').trim()

const attr = async (page: Page, selector: string, name: string) => await page.locator(selector).first().getAttribute(name)

const output = async (page: Page, id: string): Promise<string> => (await page.locator(`#${id}`).textContent()) ?? ''

/** The honeypot sits off screen and out of the tab order — present for a bot, never for a person. */
const honeypotHidden = async (page: Page): Promise<boolean> => await page.locator('[data-honeypot] input').evaluate(input => {
  const rect = input.getBoundingClientRect()
  return rect.right <= 0 && input.getAttribute('tabindex') === '-1' && input.closest('[aria-hidden="true"]') != null
})

const FORBIDDEN = /non-?refundable|nicht erstattungsf|non rembours|bezzwrotn|no reembolsable|невозвратн|неповоротн|незваротн/i

describe('PerformanceConsentDialog — contract language, one unchecked checkbox', () => {
  test('shows the German statement with the purchases, gates confirm on the checkbox, and toggles to English', async () => {
    const { page, close } = await open('case=consent&lng=de&ui=en')
    try {
      const dialog = page.locator('[data-consent-dialog]')
      await dialog.waitFor()
      expect(await dialog.getAttribute('data-language')).toBe('de')
      expect(await dialog.getAttribute('data-contract-language')).toBe('de')
      expect(await text(page, '[data-consent-statement]')).toStartWith('Ich verlange ausdrücklich und stimme ausdrücklich zu')
      expect(await text(page, '[data-consent-statement]')).toContain('Example Trader')
      expect(await page.locator('[data-consent-purchase]').count()).toBe(2)
      expect(await attr(page, '[data-consent-purchase][data-purchase-id="pur_1"]', 'data-deadline')).toBe('2026-10-09T00:00:00.000Z')
      expect(await text(page, '[data-consent-purchase][data-purchase-id="pur_1"]')).toContain('8. Oktober 2026')

      // Unchecked by default; confirm disabled until it is ticked.
      expect(await attr(page, '[data-consent-checkbox]', 'data-state')).toBe('unchecked')
      expect(await page.locator('[data-consent-confirm]').isDisabled()).toBe(true)
      expect(await text(page, '[data-consent-confirm]')).toBe('Jetzt beginnen')
      expect(await text(page, '[data-consent-decline]')).toBe('Nicht jetzt')
      expect(await attr(page, '[data-legal-link="billing-terms"]', 'href')).toBe('https://example.test/de/legal/billing-terms')
      expect(await text(page, '[data-legal-link="withdrawal-function"]')).toBe('Vertrag widerrufen')
      expect(FORBIDDEN.test(await dialog.innerText())).toBe(false)

      await page.locator('[data-consent-checkbox]').click()
      expect(await page.locator('[data-consent-confirm]').isDisabled()).toBe(false)

      // The toggle is phrased in the interface language, and un-ticks: the text agreed to is the one shown.
      expect(await text(page, '[data-consent-language-toggle]')).toBe('Show in English')
      await page.locator('[data-consent-language-toggle]').click()
      expect(await dialog.getAttribute('data-language')).toBe('en')
      expect(await text(page, '[data-consent-statement]')).toStartWith('I expressly request and agree')
      expect(await attr(page, '[data-legal-link="billing-terms"]', 'href')).toBe('https://example.test/legal/billing-terms')
      expect(await text(page, '[data-legal-link="withdrawal-function"]')).toBe('Withdraw from contract here')
      expect(await text(page, '[data-consent-language-toggle]')).toBe('Show in German')
      expect(await attr(page, '[data-consent-checkbox]', 'data-state')).toBe('unchecked')
      expect(await page.locator('[data-consent-confirm]').isDisabled()).toBe(true)

      await page.locator('[data-consent-checkbox]').click()
      await page.locator('[data-consent-confirm]').click()
      const body = JSON.parse(await output(page, 'consent-result'))
      expect(body).toEqual({
        purchaseIds: ['pur_1', 'pur_2'], textVersion: 'terms-2026-09', language: 'en', acknowledged: true, uiLanguage: 'en',
      })
    } finally { await close() }
  }, TIMEOUT)

  test('records the contract language when confirmed untoggled, and declines on "Nicht jetzt"', async () => {
    const confirmed = await open('case=consent&lng=de&ui=en')
    try {
      await confirmed.page.locator('[data-consent-checkbox]').click()
      await confirmed.page.locator('[data-consent-confirm]').click()
      expect(JSON.parse(await output(confirmed.page, 'consent-result')).language).toBe('de')
    } finally { await confirmed.close() }

    const declined = await open('case=consent&lng=de&ui=en')
    try {
      await declined.page.locator('[data-consent-decline]').click()
      expect(await output(declined.page, 'consent-result')).toBe('declined')
      expect(await declined.page.locator('[data-consent-dialog]').count()).toBe(0)
    } finally { await declined.close() }
  }, TIMEOUT)
})

describe('SubscriptionStartDialog', () => {
  test('French statement, "Continuer vers le paiement" gated on the checkbox', async () => {
    const { page, close } = await open('case=start&lng=fr')
    try {
      const dialog = page.locator('[data-start-dialog]')
      await dialog.waitFor()
      expect(await dialog.getAttribute('data-language')).toBe('fr')
      expect(await dialog.getAttribute('data-plan-sku')).toBe('pro-monthly')
      expect(await dialog.innerText()).toContain('Commencer les services Pro maintenant')
      expect(await text(page, '[data-start-statement]')).toStartWith('Je demande expressément et j’accepte expressément')
      expect(await text(page, '[data-start-price]')).toBe('€20.00 / month')
      expect(await text(page, '[data-start-confirm]')).toBe('Continuer vers le paiement')
      expect(await attr(page, '[data-start-checkbox]', 'data-state')).toBe('unchecked')
      expect(await page.locator('[data-start-confirm]').isDisabled()).toBe(true)
      expect(await text(page, '[data-start-language-toggle]')).toBe('Show in English')

      await page.locator('[data-start-checkbox]').click()
      await page.locator('[data-start-confirm]').click()
      expect(JSON.parse(await output(page, 'start-result'))).toEqual({
        planSku: 'pro-monthly', textVersion: 'terms-2026-09', language: 'fr', acknowledged: true,
      })
    } finally { await close() }
  }, TIMEOUT)
})

describe('Withdrawal function', () => {
  test('in-app, French: statutory entry and confirm, three steps, receipt with the time of receipt in UTC', async () => {
    const { page, close } = await open('case=withdrawal&lng=fr&ui=en')
    try {
      const entry = page.locator('[data-withdrawal-function]')
      await entry.waitFor()
      expect((await entry.innerText()).trim()).toBe('Renoncer au contrat ici')
      expect(await entry.getAttribute('title')).toBe('Withdraw from contract here')
      expect(await entry.getAttribute('data-language')).toBe('fr')

      await entry.click()
      const dialog = page.locator('[data-withdrawal-dialog]')
      await dialog.waitFor()
      expect(await dialog.getAttribute('data-language')).toBe('fr')
      expect(await dialog.getAttribute('data-step')).toBe('form')
      await page.locator('[data-withdrawal-step="form"]').waitFor()
      await page.locator('[data-withdrawal-candidate]').first().waitFor()
      expect(await page.locator('[data-withdrawal-candidate]').count()).toBe(2)
      expect(await attr(page, '[data-withdrawal-candidate][data-purchase-id="pur_1"] [data-withdrawal-estimate]', 'data-refund-minor')).toBe('942')
      // Only name, contract and e-mail are asked — prefilled from the list.
      expect(await page.locator('[data-withdrawal-field="name"]').inputValue()).toBe('Marie Curie')
      expect(await page.locator('[data-withdrawal-field="email"]').inputValue()).toBe('marie@example.test')

      // No contract chosen yet: the form stays.
      await page.locator('[data-withdrawal-continue]').click()
      expect(await attr(page, '[data-withdrawal-form]', 'data-withdrawal-step')).toBe('form')

      await page.locator('[data-withdrawal-candidate-input="pur_1"]').check()
      await page.locator('[data-withdrawal-continue]').click()
      await page.locator('[data-withdrawal-step="review"]').waitFor()
      expect(await dialog.getAttribute('data-step')).toBe('review')
      expect(await text(page, '[data-withdrawal-confirm]')).toBe('Confirmer la rétractation')

      await page.locator('[data-withdrawal-language-toggle]').click()
      expect(await text(page, '[data-withdrawal-confirm]')).toBe('Confirm withdrawal')
      await page.locator('[data-withdrawal-language-toggle]').click()
      expect(await text(page, '[data-withdrawal-confirm]')).toBe('Confirmer la rétractation')

      await page.locator('[data-withdrawal-confirm]').click()
      const receipt = page.locator('[data-withdrawal-receipt]')
      await receipt.waitFor()
      expect(await dialog.getAttribute('data-step')).toBe('receipt')
      expect(await receipt.getAttribute('data-status')).toBe('refunded')
      expect(await receipt.getAttribute('data-declaration-id')).toBe('wd_7Kq2')
      expect(await receipt.getAttribute('data-received-at')).toBe('2026-09-27T14:05:09.000Z')
      expect(await text(page, '[data-withdrawal-received-at]')).toContain('14:05:09')
      expect(await text(page, '[data-withdrawal-received-at]')).toContain('UTC')
      expect(await receipt.innerText()).toContain('Votre rétractation a été reçue le')

      expect(JSON.parse(await output(page, 'withdrawal-body'))).toEqual({
        purchaseId: 'pur_1', contractRef: 'CR-260923-AB12CD', name: 'Marie Curie', email: 'marie@example.test', language: 'fr',
      })
    } finally { await close() }
  }, TIMEOUT)

  test('public, German: contract reference, name and e-mail only, a honeypot no one reaches', async () => {
    const { page, close } = await open('case=withdrawal-public&lng=de&ui=de')
    try {
      await page.locator('[data-withdrawal-form]').waitFor()
      // Contract, name, e-mail — and the honeypot, which no person sees.
      expect(await page.locator('[data-withdrawal-form] input').count()).toBe(4)
      expect(await honeypotHidden(page)).toBe(true)
      await page.locator('[data-withdrawal-field="contract"]').fill('CR-260923-AB12CD')
      await page.locator('[data-withdrawal-field="name"]').fill('Max Mustermann')
      await page.locator('[data-withdrawal-field="email"]').fill('not-an-address')
      await page.locator('[data-withdrawal-continue]').click()
      expect(await attr(page, '[data-withdrawal-form]', 'data-step')).toBe('form')
      await page.locator('[data-withdrawal-field="email"]').fill('max@example.test')
      await page.locator('[data-withdrawal-continue]').click()
      expect(await text(page, '[data-withdrawal-confirm]')).toBe('Widerruf bestätigen')
      await page.locator('[data-withdrawal-confirm]').click()
      await page.locator('[data-withdrawal-receipt]').waitFor()
      expect(await attr(page, '[data-withdrawal-receipt]', 'data-status')).toBe('received')
      expect(JSON.parse(await output(page, 'withdrawal-body'))).toEqual({
        contractRef: 'CR-260923-AB12CD', name: 'Max Mustermann', email: 'max@example.test', language: 'de',
      })
    } finally { await close() }
  }, TIMEOUT)
})

describe('CancellationForm', () => {
  test('German: kind, reason for cause, summary with "Jetzt kündigen", receipt with the effective date and print', async () => {
    const { page, close } = await open('case=cancellation&lng=de&ui=de')
    try {
      const form = page.locator('[data-cancellation-form]')
      await form.waitFor()
      expect(await form.getAttribute('data-cancellation-step')).toBe('form')
      expect(await form.getAttribute('data-language')).toBe('de')
      expect(await honeypotHidden(page)).toBe(true)

      await page.locator('[data-cancellation-field="kind"][data-kind="extraordinary"]').check()
      await page.locator('[data-cancellation-field="name"]').fill('Max Mustermann')
      await page.locator('[data-cancellation-field="email"]').fill('max@example.test')
      await page.locator('[data-cancellation-continue]').click()
      // A cancellation for cause needs its reason.
      expect(await form.getAttribute('data-cancellation-step')).toBe('form')
      await page.locator('[data-cancellation-field="kind"][data-kind="ordinary"]').check()
      await page.locator('[data-cancellation-field="contract"]').fill('CR-260925-ZZ99YY')
      await page.locator('[data-cancellation-continue]').click()

      await page.locator('[data-cancellation-step="review"]').waitFor()
      expect(await text(page, '[data-cancellation-summary] [data-summary="contract"]')).toBe('CR-260925-ZZ99YY')
      expect(await text(page, '[data-cancellation-confirm]')).toBe('Jetzt kündigen')
      await page.locator('[data-cancellation-confirm]').click()

      const receipt = page.locator('[data-cancellation-receipt]')
      await receipt.waitFor()
      expect(await receipt.getAttribute('data-status')).toBe('scheduled')
      expect(await receipt.getAttribute('data-effective-at')).toBe('2026-10-31T00:00:00.000Z')
      expect(await receipt.getAttribute('data-received-at')).toBe('2026-09-27T16:30:00.000Z')
      expect(await text(page, '[data-cancellation-effective]')).toContain('31. Oktober 2026')
      await page.locator('[data-cancellation-print]').click()
      expect(await output(page, 'printed')).toBe('printed')
      expect(JSON.parse(await output(page, 'cancellation-body'))).toEqual({
        kind: 'ordinary', name: 'Max Mustermann', contractRef: 'CR-260925-ZZ99YY', effective: 'earliest',
        email: 'max@example.test', language: 'de',
      })
    } finally { await close() }
  }, TIMEOUT)

  test('French and English statutory confirm labels', async () => {
    for (const [lng, label] of [['fr', 'Notification de la résiliation'], ['en', 'Cancel now']] as const) {
      const { page, close } = await open(`case=cancellation&lng=${lng}&ui=${lng}`)
      try {
        await page.locator('[data-cancellation-field="name"]').fill('A Person')
        await page.locator('[data-cancellation-field="email"]').fill('a@example.test')
        await page.locator('[data-cancellation-continue]').click()
        expect(await text(page, '[data-cancellation-confirm]')).toBe(label)
      } finally { await close() }
    }
  }, TIMEOUT)
})

describe('Checkout limit', () => {
  test('a per-purchase limit hides presets above it, names its maximum, and refuses more', async () => {
    const { page, close } = await open('case=limit')
    try {
      const note = page.locator('[data-checkout-limit]')
      await note.waitFor()
      expect(await note.getAttribute('data-max-minor')).toBe('2500')
      expect(await note.getAttribute('data-blocked')).toBe('false')
      expect(await note.getAttribute('data-reason')).toBe('per-purchase')
      expect(await note.innerText()).toContain('You can add up to $25.00 right now.')
      expect(await page.locator('[data-amount-preset]').evaluateAll(items => items.map(item => item.getAttribute('data-amount-preset'))))
        .toEqual(['1000', '2000'])
      expect(await page.locator('[data-harness-legal-note]').count()).toBe(1)

      const input = page.getByLabel('Custom amount')
      await input.fill('30')
      expect(await page.getByText('The most you can add right now is $25.00.').count()).toBe(1)
      expect(await page.locator('[data-amount-confirm]').isDisabled()).toBe(true)
      await input.fill('25')
      expect(await page.locator('[data-amount-confirm]').isDisabled()).toBe(false)
      await page.locator('[data-amount-confirm]').click()
      expect(await output(page, 'confirmed')).toBe('2500')
    } finally { await close() }
  }, TIMEOUT)

  test('a blocked limit disables the amount and the confirm button', async () => {
    const { page, close } = await open('case=limit&blocked=true')
    try {
      const note = page.locator('[data-checkout-limit]')
      await note.waitFor()
      expect(await note.getAttribute('data-blocked')).toBe('true')
      expect(await note.getAttribute('data-reason')).toBe('window')
      expect(await note.innerText()).toContain('You cannot add credits right now.')
      expect(await page.getByLabel('Custom amount').isDisabled()).toBe(true)
      expect(await page.locator('[data-amount-confirm]').isDisabled()).toBe(true)
      expect(await page.locator('[data-amount-preset]').count()).toBe(0)
    } finally { await close() }
  }, TIMEOUT)
})

describe('Locked billing country', () => {
  test('the estimate adopts the locked country and the picker is disabled with its note', async () => {
    const { page, close } = await open('case=country-locked')
    try {
      await page.locator('[data-country-select][data-locked="true"]').waitFor()
      await page.locator('#locked:text("true")').waitFor()
      expect(await attr(page, '[data-country-select]', 'data-country')).toBe('DE')
      expect(await page.getByLabel('Billing country').isDisabled()).toBe(true)
      expect(await text(page, '[data-country-note]')).toBe('Your billing country was set by your first purchase and cannot be changed here.')
      // The first request named no country; the locked answer's country is the one asked next.
      expect(JSON.parse(await output(page, 'requested'))).toEqual(['', 'DE'])
    } finally { await close() }
  }, TIMEOUT)
})

describe('PerformanceConsentProvider + useConsentGate', () => {
  test('a bare 428 opens the one dialog, and after consent the action is retried exactly once', async () => {
    const { page, close } = await open('case=consent-gate&lng=pl&ui=en')
    try {
      await page.locator('#gate-run').click()
      const dialog = page.locator('[data-consent-dialog]')
      await dialog.waitFor()
      expect(await dialog.getAttribute('data-language')).toBe('pl')
      await page.locator('[data-consent-checkbox]').click()
      await page.locator('[data-consent-confirm]').click()
      await page.locator('#gate-result:text("ok:2")').waitFor()
      expect(JSON.parse(await output(page, 'recorded'))).toEqual(expect.objectContaining({
        purchaseIds: ['pur_1', 'pur_2'], language: 'pl', acknowledged: true,
      }))
      await dialog.waitFor({ state: 'detached' })

      // Recorded: ensure() now answers true with no dialog.
      await page.locator('#gate-ensure').click()
      await page.locator('#gate-result:text("ensure:true")').waitFor()
      expect(await page.locator('[data-consent-dialog]').count()).toBe(0)
    } finally { await close() }
  }, TIMEOUT)

  test('a decline throws ConsentDeclined and the action is not retried', async () => {
    const { page, close } = await open('case=consent-gate&lng=pl&ui=en')
    try {
      await page.locator('#gate-run').click()
      await page.locator('[data-consent-dialog]').waitFor()
      await page.locator('[data-consent-decline]').click()
      await page.locator('#gate-result:text("declined:1")').waitFor()
      expect(await output(page, 'gate-calls')).toBe('1')
    } finally { await close() }
  }, TIMEOUT)
})
