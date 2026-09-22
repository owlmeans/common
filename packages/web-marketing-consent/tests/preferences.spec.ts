import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser } from '@owlmeans/test-ui'
import { STANDARD_MARKETING_CONSENTS } from '@owlmeans/marketing-consent'
import { open, statusView, TIMEOUT } from './helpers.js'

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
})
