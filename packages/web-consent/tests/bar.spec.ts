import { afterAll, describe, expect, test } from 'bun:test'
import { mountComponent, browserHelper } from '@owlmeans/test-ui'
import type { Page } from '@owlmeans/test-ui'
import { CONSENT_KEY, CONSENT_LOCALES, consentI18nHelper } from '@owlmeans/consent'
import { HARNESS_URL } from './context.js'

const TIMEOUT = 60_000

afterAll(async () => {
  await browserHelper.closeBrowser()
})

const base = HARNESS_URL.replace(/\/$/, '')

const stored = async (page: Page): Promise<Record<string, unknown> | null> =>
  await page.evaluate(key => {
    const raw = window.localStorage.getItem(key)

    return raw == null ? null : JSON.parse(raw) as Record<string, unknown>
  }, CONSENT_KEY)

const lastUpdate = async (page: Page): Promise<Record<string, string> | null> =>
  await page.evaluate(() => {
    const layer = ((window as never as { dataLayer?: unknown[] }).dataLayer ?? [])
      .map(item => Array.from(item as ArrayLike<unknown>))

    return (layer.filter(entry => entry[1] === 'update').pop()?.[2] ?? null) as Record<string, string> | null
  })

describe('@owlmeans/web-consent — the bar', () => {
  test('a first-time visitor meets the bar: three answers, the categories in force, the links', async () => {
    const { page, close } = await mountComponent({ url: `${base}/` })
    try {
      const bar = page.locator('[data-consent-bar]')
      await bar.waitFor()

      // One consent surface, carrying the shared hooks every test and host keys on.
      expect(await page.locator('[data-consent-dialog]').count()).toBe(1)
      expect(await bar.getAttribute('data-consent-mode')).toBe('bar')
      expect(await bar.getAttribute('role')).toBe('dialog')
      expect(await bar.getAttribute('aria-modal')).toBe('true')
      expect(await page.locator('[data-consent-save]').count()).toBe(0)

      expect(await bar.locator('[data-consent-preferences]').innerText()).toBe('Cookie preferences')
      expect(await bar.locator('[data-consent-mandatory]').innerText()).toBe('Accept only mandatory')
      expect(await bar.locator('[data-consent-accept-all]').innerText()).toBe('Accept All')

      const text = await bar.innerText()
      expect(text).toContain('Analytics Cookies, Marketing Cookies')
      expect(text).toContain('withdraw')
      expect(await bar.locator('a[href="/cookies"]').innerText()).toBe('Cookie Policy')
      expect(await bar.locator('a[href="https://example.test/privacy"]').count()).toBe(1)
      // Nothing was granted by showing it.
      expect(await stored(page)).toBeNull()
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('"Accept only mandatory" refuses every optional category', async () => {
    const { page, close } = await mountComponent({ url: `${base}/` })
    try {
      await page.locator('[data-consent-mandatory]').click()
      await page.waitForSelector('[data-consent-reopen]')

      expect(await page.locator('[data-consent-dialog]').count()).toBe(0)
      expect(await stored(page)).toMatchObject({ essential: true, analytics: false, marketing: false })
      expect((await stored(page))?.auto).toBeUndefined()
      expect(await lastUpdate(page)).toMatchObject({ analytics_storage: 'denied', ad_storage: 'denied' })
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('"Accept all" grants every category', async () => {
    const { page, close } = await mountComponent({ url: `${base}/` })
    try {
      await page.locator('[data-consent-accept-all]').click()
      await page.waitForSelector('[data-consent-reopen]')

      expect(await stored(page)).toMatchObject({ essential: true, analytics: true, marketing: true })
      expect(await lastUpdate(page)).toMatchObject({ analytics_storage: 'granted', ad_storage: 'granted' })
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-consent'))).toBe('decided')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('"Cookie preferences" replaces the bar with the window, and saving there decides', async () => {
    const { page, close } = await mountComponent({ url: `${base}/` })
    try {
      await page.locator('[data-consent-preferences]').click()
      await page.waitForSelector('[data-consent-dialog][data-consent-mode="window"]')

      // Replaced, never stacked: one surface, one accept button.
      expect(await page.locator('[data-consent-bar]').count()).toBe(0)
      expect(await page.locator('[data-consent-dialog]').count()).toBe(1)
      expect(await page.locator('[data-consent-accept-all]').count()).toBe(1)

      await page.getByRole('checkbox', { name: 'Analytics Cookies' }).check({ force: true })
      await page.locator('[data-consent-save]').click()
      await page.waitForSelector('[data-consent-reopen]')

      expect(await stored(page)).toMatchObject({ essential: true, analytics: true, marketing: false })
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the bar is flat, sits on a dimmed overlay, and both answers are equally prominent', async () => {
    const { page, close } = await mountComponent({ url: `${base}/` })
    try {
      const bar = page.locator('[data-consent-bar]')
      await bar.waitFor()
      const overlay = page.locator('[data-consent-overlay]')
      const classes = await overlay.evaluate(root => [root, ...Array.from(root.querySelectorAll('*'))]
        .map(element => element.getAttribute('class') ?? '').join(' '))

      expect(classes).not.toMatch(/\b(?:bg-gradient|from-|to-secondary|backdrop-|blur|shadow|ring-primary)/)
      expect(await overlay.getAttribute('class')).toContain('bg-black/70')
      expect(await overlay.getAttribute('class')).toMatch(/\binset-0\b/)
      expect(await bar.getAttribute('class')).toMatch(/\bbottom-0\b/)
      expect(await bar.getAttribute('class')).toMatch(/\bbg-background\b/)
      expect(await bar.getAttribute('class')).toMatch(/\bborder-t\b/)

      const mandatory = await page.locator('[data-consent-mandatory]').getAttribute('class') ?? ''
      const accept = await page.locator('[data-consent-accept-all]').getAttribute('class') ?? ''
      const preferences = await page.locator('[data-consent-preferences]').getAttribute('class') ?? ''
      // Refusing is exactly as prominent as accepting.
      expect(mandatory).toBe(accept)
      expect(accept).toMatch(/\bbg-primary\b/)
      expect(preferences).not.toMatch(/\bbg-primary\b/)
      expect(preferences).toMatch(/\bborder-foreground\b/)
      for (const cls of [mandatory, accept, preferences]) {
        expect(cls).toMatch(/\brounded-full\b/)
        expect(cls).toMatch(/\bmin-h-11\b/)
        expect(cls).toContain('focus-visible:outline-ring')
      }
    } finally {
      await close()
    }
  }, TIMEOUT)

  test.each(['light', 'dark'])('styled (%s): the page is dimmed and out of reach, the bar sits at the very bottom', async theme => {
    const { page, close } = await mountComponent({ url: `${base}/?styled=1&theme=${theme}` })
    try {
      const bar = page.locator('[data-consent-bar]')
      await bar.waitFor()
      const viewport = page.viewportSize()!
      const box = (await bar.boundingBox())!

      expect(Math.round(box.y + box.height)).toBe(viewport.height)
      expect(Math.round(box.width)).toBe(viewport.width)
      const blocked = await page.evaluate(() => {
        const hit = document.elementFromPoint(10, 10)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')!
        context.fillStyle = hit == null ? 'transparent' : getComputedStyle(hit).backgroundColor
        context.fillRect(0, 0, 1, 1)

        return {
          overlay: hit?.closest('[data-consent-overlay]') != null,
          background: Array.from(context.getImageData(0, 0, 1, 1).data),
          opacity: hit == null ? null : getComputedStyle(hit).opacity,
        }
      })
      // Dim the page with the same translucent black as the preferences window, in both themes.
      expect(blocked.overlay).toBe(true)
      expect(blocked.background).toEqual([0, 0, 0, 179])
      expect(blocked.opacity).toBe('1')
      expect(await bar.evaluate(root => getComputedStyle(root).opacity)).toBe('1')
      // The remount button under the overlay cannot be pressed.
      await expect(page.locator('#remount').click({ timeout: 1_000 })).rejects.toThrow()
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('keyboard: focus starts on the bar itself and Tab never leaves it', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?styled=1` })
    try {
      await page.waitForSelector('[data-consent-bar]')
      await page.waitForFunction(() => document.activeElement?.hasAttribute('data-consent-bar') === true)

      for (let press = 0; press < 8; press++) {
        await page.keyboard.press(press % 3 === 2 ? 'Shift+Tab' : 'Tab')
        expect(await page.evaluate(() =>
          document.activeElement?.closest('[data-consent-bar]') != null)).toBe(true)
      }
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('with nothing optional there is nothing to refuse: no "mandatory" answer, the essential text', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?categories=essential` })
    try {
      const bar = page.locator('[data-consent-bar]')
      await bar.waitFor()

      expect(await page.locator('[data-consent-mandatory]').count()).toBe(0)
      expect(await bar.innerText()).toContain('only essential cookies')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('window mode asks with the window straight away', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?mode=window` })
    try {
      await page.waitForSelector('[data-consent-dialog][data-consent-mode="window"]')

      expect(await page.locator('[data-consent-bar]').count()).toBe(0)
      expect(await page.locator('[data-consent-save]').count()).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the "mandatory" answer is translated in every locale', async () => {
    for (const locale of CONSENT_LOCALES) {
      const { page, close } = await mountComponent({ url: `${base}/?locale=${locale}` })
      try {
        const label = await page.locator('[data-consent-mandatory]').innerText()

        expect(label).toBe(consentI18nHelper.defaultConsentTranslate(locale)('acceptMandatory', ''))
      } finally {
        await close()
      }
    }
  }, TIMEOUT * 3)
})
