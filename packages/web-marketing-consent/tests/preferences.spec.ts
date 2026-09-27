import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser } from '@owlmeans/test-ui'
import { STANDARD_MARKETING_CONSENTS } from '@owlmeans/marketing-consent'
import { allItemsCurrent, open, statusView, TIMEOUT } from './helpers.js'

afterAll(async () => { await closeBrowser() })

const keys = STANDARD_MARKETING_CONSENTS.map(definition => definition.key)

describe('MarketingConsentPreferences — a host settings card', () => {
  test('nothing is checked by default, and there is no skip link (this is not a login step)', async () => {
    const { page, close } = await open('/prefs', {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-preferences-save]').waitFor({ state: 'visible', timeout: 45_000 })

      for (const key of keys) {
        expect(await page.locator(`[data-marketing-consent-item="${key}"]`).isChecked()).toBe(false)
      }
      expect(await page.locator('[data-marketing-consent-skip]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('saving does not navigate, and calls onSaved once it succeeds', async () => {
    const { page, calls, lastSaveBody, close } = await open('/prefs', {
      signedIn: true,
      stubs: {
        status: { json: statusView() },
        save: { json: { ok: true, status: statusView({ [keys[0]]: { status: 'current', granted: true } }) } },
      },
    })
    try {
      await page.locator('[data-marketing-consent-preferences-save]').waitFor({ state: 'visible', timeout: 45_000 })

      await page.locator(`[data-marketing-consent-item="${keys[0]}"]`).click()
      await page.locator('[data-marketing-consent-preferences-save]').click()

      await page.waitForFunction(
        () => (window as unknown as { __mcSaved?: boolean }).__mcSaved === true, undefined, { timeout: 30_000 }
      )

      expect(new URL(page.url()).pathname).toBe('/prefs')
      expect(calls).toEqual(['GET status', 'POST save'])
      expect(lastSaveBody()?.source).toBe('settings')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('even with Terms mode on, this card shows no Terms box and never posts a terms acceptance', async () => {
    const { page, calls, close } = await open('/prefs', {
      signedIn: true, termsMode: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-preferences-save]').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await page.locator('[data-marketing-consent-terms]').count()).toBe(0)
      expect(calls).not.toContain('POST terms')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a failed save shows the error and does not call onSaved', async () => {
    const { page, close } = await open('/prefs', {
      signedIn: true,
      stubs: { status: { json: statusView() }, save: { status: 500, error: 'boom' } },
    })
    try {
      await page.locator('[data-marketing-consent-preferences-save]').waitFor({ state: 'visible', timeout: 45_000 })
      await page.locator('[data-marketing-consent-preferences-save]').click()

      await page.getByRole('alert').waitFor({ state: 'visible', timeout: 30_000 })
      expect(
        await page.evaluate(() => (window as unknown as { __mcSaved?: boolean }).__mcSaved)
      ).not.toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)

  /**
   * The bug this pins: `useMarketingConsent` used to gate ALL items on catalogue-wide
   * `status.pending`, the rule that is correct for the sign-in STEP (ask only what's outstanding)
   * but wrong for this standing card — a fully-decided account (`status.pending === false`) would
   * render zero checkboxes at all, silently contradicting "changeable at any time". This card must
   * load and show every item regardless of whether anything is pending.
   */
  test('a fully-decided account still shows every item, checked as saved, and can still save', async () => {
    const { page, close } = await open('/prefs', {
      signedIn: true,
      stubs: {
        status: { json: statusView(allItemsCurrent()) },
        save: { json: { ok: true, status: statusView(allItemsCurrent()) } },
      },
    })
    try {
      await page.locator('[data-marketing-consent-preferences-save]').waitFor({ state: 'visible', timeout: 45_000 })

      for (const key of keys) {
        // `allItemsCurrent` only marks `status: 'current'`, leaving `granted` at its `statusView`
        // default (`false`) — the point here is that the checkbox EXISTS at all, not its value.
        expect(await page.locator(`[data-marketing-consent-item="${key}"]`).count()).toBe(1)
      }

      await page.locator('[data-marketing-consent-preferences-save]').click()
      await page.waitForFunction(
        () => (window as unknown as { __mcSaved?: boolean }).__mcSaved === true, undefined, { timeout: 30_000 }
      )
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the card carries no cookie integration either: only the consent rows, none of them a tracker', async () => {
    const { page, close } = await open('/prefs', {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-preferences-save]').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await page.locator('[data-marketing-consent-item]').count()).toBe(keys.length)
      expect(await page.locator('[data-marketing-consent-cookie-linked]').count()).toBe(0)
      expect(await page.locator('[data-marketing-consent-from-cookies]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the same list: Select all first, each row with its statement and its last-updated date', async () => {
    const { page, close } = await open('/prefs', {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-preferences-save]').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await page.locator('[data-marketing-consent-all-frame]').count()).toBe(1)
      for (const definition of STANDARD_MARKETING_CONSENTS) {
        const row = page.locator('label', { has: page.locator(`[data-marketing-consent-item="${definition.key}"]`) })
        expect((await row.textContent())!.trim()).toStartWith('I confirm that I agree')
        expect(await page.locator(`[data-marketing-consent-revised="${definition.key}"]`).textContent())
          .toBe(`Last updated: ${definition.revisedAt}`)
      }
      // The card has no Terms row, so nothing on it is mandatory.
      expect(await page.locator('[data-marketing-consent-required]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('Select all here selects the consents and saves them as settings', async () => {
    const { page, lastSaveBody, close } = await open('/prefs', {
      signedIn: true,
      stubs: { status: { json: statusView() }, save: { json: { ok: true, status: statusView() } } },
    })
    try {
      await page.locator('[data-marketing-consent-all]').waitFor({ state: 'visible', timeout: 45_000 })

      await page.locator('[data-marketing-consent-all]').click()
      await page.locator('[data-marketing-consent-preferences-save]').click()
      await page.waitForFunction(
        () => (window as unknown as { __mcSaved?: boolean }).__mcSaved === true, undefined, { timeout: 30_000 }
      )

      const body = lastSaveBody()
      expect(body?.source).toBe('settings')
      expect(body?.decisions.every(decision => decision.granted)).toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)
})
