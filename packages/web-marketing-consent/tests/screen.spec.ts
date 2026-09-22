import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser } from '@owlmeans/test-ui'
import { MARKETING_CONSENT_SCREEN_PATH, STANDARD_MARKETING_CONSENTS } from '@owlmeans/marketing-consent'
import en from '../src/i18n/en.json' with { type: 'json' }
import { bearer, open, statusView, TIMEOUT } from './helpers.js'

afterAll(async () => { await closeBrowser() })

const keys = STANDARD_MARKETING_CONSENTS.map(definition => definition.key)

describe('marketing-consent screen — signed in', () => {
  test('nothing is checked by default', async () => {
    const { page, calls, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      for (const key of keys) {
        expect(await page.locator(`[data-marketing-consent-item="${key}"]`).isChecked()).toBe(false)
      }
      expect(await page.locator('[data-marketing-consent-all]').isChecked()).toBe(false)
      expect(calls).toEqual(['GET status'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('select-all checks every item, and unchecking one shows indeterminate', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      const all = page.locator('[data-marketing-consent-all]')
      await all.waitFor({ state: 'visible', timeout: 45_000 })

      await all.click()
      for (const key of keys) {
        expect(await page.locator(`[data-marketing-consent-item="${key}"]`).isChecked()).toBe(true)
      }
      expect(await all.isChecked()).toBe(true)
      expect(await all.evaluate(node => (node as HTMLInputElement).indeterminate)).toBe(false)

      await page.locator(`[data-marketing-consent-item="${keys[0]}"]`).click()
      expect(await all.isChecked()).toBe(false)
      expect(await all.evaluate(node => (node as HTMLInputElement).indeterminate)).toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('an item flagged updated shows the "Updated" badge', async () => {
    const key = keys[0]
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true,
      stubs: { status: { json: statusView({ [key]: { status: 'revised', updated: true, granted: false } }) } },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      const badge = page.locator(`[data-marketing-consent-updated="${key}"]`)
      expect(await badge.count()).toBe(1)
      expect(await badge.textContent()).toBe(en.screen.updated)

      // Only the flagged item carries the badge.
      expect(await page.locator(`[data-marketing-consent-updated="${keys[1]}"]`).count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('save posts every current draft value, for every key, and then continues the flow', async () => {
    const { page, calls, lastSaveBody, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true,
      stubs: {
        status: { json: statusView() },
        save: { json: { ok: true, status: statusView({ [keys[0]]: { status: 'current', granted: true } }) } },
      },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      // Toggle exactly one on; the rest stay at their loaded (false) draft value.
      await page.locator(`[data-marketing-consent-item="${keys[0]}"]`).click()
      await page.locator('[data-marketing-consent-save]').click()

      await page.waitForURL(url => url.pathname === '/', { timeout: 30_000 })

      expect(calls).toEqual(['GET status', 'POST save'])
      const body = lastSaveBody()
      expect(body?.source).toBe('sign-in')
      expect(body?.decisions).toHaveLength(keys.length)
      for (const key of keys) {
        const decision = body?.decisions.find(entry => entry.key === key)
        expect(decision?.granted).toBe(key === keys[0])
      }
      expect(await page.locator('#home').count()).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a failed save shows the error and the skip link, and skip still moves the flow on', async () => {
    const { page, calls, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true,
      stubs: { status: { json: statusView() }, save: { status: 500, error: 'boom' } },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })
      await page.locator('[data-marketing-consent-save]').click()

      const error = page.locator('[data-marketing-consent-error]')
      await error.waitFor({ state: 'visible', timeout: 30_000 })
      expect(await error.textContent()).toBe(en.screen.error)

      const skip = page.locator('[data-marketing-consent-skip]')
      await skip.waitFor({ state: 'visible' })
      expect(await skip.textContent()).toBe(en.screen.skip)

      await skip.click()
      await page.waitForURL(url => url.pathname === '/', { timeout: 30_000 })
      expect(await page.locator('#home').count()).toBe(1)
      expect(calls).toEqual(['GET status', 'POST save'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a framed mount still renders — there is no framed refusal', async () => {
    const src = encodeURIComponent(
      `${MARKETING_CONSENT_SCREEN_PATH}?bearer=${encodeURIComponent(await bearer())}`
    )
    const { page, close } = await open(`/frame.html?src=${src}`, {
      stubs: { status: { json: statusView() } },
    })
    try {
      const frame = page.frameLocator('#frame')
      await frame.locator('[data-marketing-consent]').waitFor({ state: 'visible', timeout: 45_000 })
      await frame.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await frame.locator('[data-marketing-consent-error]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)
})
