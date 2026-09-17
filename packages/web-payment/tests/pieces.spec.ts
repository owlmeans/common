import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent, type Page } from '@owlmeans/test-ui'
import { closeHarness, harnessUrl } from './context.js'

const TIMEOUT = 60_000

afterAll(async () => {
  await closeBrowser()
  await closeHarness()
})

const open = async (scenario: string) => {
  const mounted = await mountComponent({ url: `${await harnessUrl()}?case=${scenario}` })
  await mounted.page.locator('main').waitFor()
  return mounted
}

const text = async (page: Page, selector: string): Promise<string> =>
  (await page.locator(selector).innerText()).replace(/\s+/g, ' ').trim()

describe('PlanCard', () => {
  test('writes the status line of every plan state', async () => {
    const { page, close } = await open('pieces')
    try {
      const line = (name: string) => text(page, `[data-case="${name}"] [data-plan-status-line]`)
      expect(await line('renews')).toBe('Renews on Oct 16, 2026')
      expect(await line('trial')).toBe('Trial ends on Sep 30, 2026')
      expect(await line('past-due')).toBe('Payment past due')
      expect(await line('cancel-scheduled')).toBe('Cancels on Oct 16, 2026')
      expect(await line('paused')).toBe('Paused since Sep 1, 2026')
      expect(await line('free')).toBe('Free plan')
      expect(await line('active')).toBe('Active')
      expect(await page.locator('[data-case="past-due"] [data-plan-card]').getAttribute('data-plan-tone')).toBe('warning')
    } finally { await close() }
  }, TIMEOUT)

  test('renders an offer with its price, marks the current plan, and reports the action', async () => {
    const { page, close } = await open('pieces')
    try {
      const current = page.locator('[data-case="offer-current"] [data-plan-card]')
      expect(await current.getAttribute('data-current')).toBe('true')
      expect(await text(page, '[data-case="offer-current"] [data-plan-current]')).toBe('Current plan')
      expect(await text(page, '[data-case="offer-current"] [data-plan-status-line]')).toBe('Free plan')

      const upgrade = page.locator('[data-case="offer-upgrade"] [data-plan-card]')
      expect(await upgrade.getAttribute('data-plan-sku')).toBe('pro-monthly')
      expect(await upgrade.getAttribute('data-current')).toBeNull()
      expect(await upgrade.locator('[data-plan-status-line]').count()).toBe(0)
      expect(await text(page, '[data-case="offer-upgrade"] [data-plan-price]')).toBe('$20 / month')
      expect(await upgrade.innerText()).toContain('Everything in Free, and more.')

      expect(await page.locator('[data-case="offer-pending"] button').isDisabled()).toBe(true)
      await upgrade.getByRole('button', { name: 'Upgrade' }).click()
      expect(await page.locator('#acted').textContent()).toBe('pro-monthly')
    } finally { await close() }
  }, TIMEOUT)
})

describe('LimitMeter and CapabilityList', () => {
  test('meter usage, resets, exhaustion, "not included" and promos', async () => {
    const { page, close } = await open('pieces')
    try {
      const meter = (key: string) => page.locator(`[data-case="limits"] > [data-limit-key="${key}"]`)
      expect(await text(page, '[data-case="limits"] > [data-limit-key="seats"] [data-limit-usage]')).toBe('3 of 5')
      expect(await meter('seats').getByRole('progressbar', { name: 'Seats' }).getAttribute('aria-valuenow')).toBe('60')
      expect(await text(page, '[data-case="limits"] > [data-limit-key="seats"] [data-limit-resets]')).toBe('Resets on Oct 1, 2026')

      expect(await meter('exports').getAttribute('data-exhausted')).toBe('true')
      expect(await meter('exports').innerText()).toContain('Limit reached')
      expect(await meter('exports').innerText()).toContain('Resets on Sep 17, 2026')

      expect(await text(page, '[data-case="limits"] > [data-limit-key="projects"] [data-limit-usage]')).toBe('Not included')
      expect(await meter('projects').getByRole('progressbar').count()).toBe(0)
      expect(await meter('projects').locator('[data-limit-resets]').count()).toBe(0)

      expect(await text(page, '[data-case="limits"] > [data-limit-key="sites"] [data-promo]')).toBe('Free until Dec 31, 2026')
      expect(await page.locator('[data-case="no-reset"] [data-limit-resets]').count()).toBe(0)
    } finally { await close() }
  }, TIMEOUT)

  test('list labelled capabilities with their promo inscriptions and skip the rest', async () => {
    const { page, close } = await open('pieces')
    try {
      const rows = page.locator('[data-case="capabilities"] [data-capability]')
      expect(await rows.evaluateAll(items => items.map(item => item.getAttribute('data-capability'))))
        .toEqual(['feature:whitelabel', 'feature:local-llm', 'feature:conversions', 'feature:beta'])
      const promo = (param: string) => text(page, `[data-case="capabilities"] [data-capability="${param}"] [data-promo]`)
      expect(await promo('feature:local-llm')).toBe('Free until Dec 31, 2026')
      expect(await promo('feature:conversions')).toBe('Included for your plan')
      expect(await promo('feature:beta')).toBe('Promotion ended')
      expect(await page.locator('[data-case="capabilities"] [data-capability="feature:beta"]').getAttribute('data-granted'))
        .toBe('false')
      expect(await page.locator('[data-capability="feature:custom-domain"]').count()).toBe(0)
      expect(await page.locator('[data-case="only-granted"] [data-capability]').count()).toBe(3)
      expect(await page.locator('[data-case="only-granted"] [data-capability="feature:beta"]').count()).toBe(0)
    } finally { await close() }
  }, TIMEOUT)
})

describe('useEntitlementView', () => {
  test('answers null until the protocol answers, then renders the revived wire view', async () => {
    const { page, close } = await open('hook')
    try {
      expect(await page.locator('#capability').textContent()).toBe('null')
      await page.locator('[data-plan-card]').waitFor()
      expect(await page.locator('#capability').textContent()).toBe('true')
      expect(await page.locator('#seats').textContent()).toBe('3/5:0.6')
      expect(await text(page, '[data-plan-status-line]')).toBe('Renews on Oct 16, 2026')
      expect(await text(page, '[data-limit-key="seats"] [data-limit-resets]')).toBe('Resets on Oct 1, 2026')
    } finally { await close() }
  }, TIMEOUT)
})
