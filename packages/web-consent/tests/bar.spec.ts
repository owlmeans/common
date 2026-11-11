import { afterAll, describe, expect, test } from 'bun:test'
import { mountComponent, browserHelper } from '@owlmeans/test-ui'
import type { Page } from '@owlmeans/test-ui'
import { CONSENT_KEY, CONSENT_LOCALES, consentI18nHelper } from '@owlmeans/consent'
import { HARNESS_URL } from './context.js'
import { HARNESS_SIGNALS } from './harness/signals.js'
import type { HarnessSignal } from './harness/signals.js'

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

/** What the store last signalled to the harness provider (`tests/harness/signals.ts`), per category. */
const lastUpdate = async (page: Page): Promise<Record<string, boolean> | null> =>
  await page.evaluate(name => ((window as never as Record<string, HarnessSignal[] | undefined>)[name] ?? [])
    .filter(signal => signal.step === 'apply').pop()?.granted ?? null, HARNESS_SIGNALS)

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
      // Non-modal: the page behind it stays usable, so nothing may tell assistive technology otherwise.
      expect(await bar.getAttribute('aria-modal')).toBeNull()
      expect(await page.locator('[data-consent-overlay]').count()).toBe(0)
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
      expect(await lastUpdate(page)).toEqual({ essential: true, analytics: false, marketing: false })
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
      expect(await lastUpdate(page)).toEqual({ essential: true, analytics: true, marketing: true })
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

  test('the bar is flat, floats without an overlay, and both answers are equally prominent', async () => {
    const { page, close } = await mountComponent({ url: `${base}/` })
    try {
      const bar = page.locator('[data-consent-bar]')
      await bar.waitFor()
      const classes = await bar.evaluate(root => [root, ...Array.from(root.querySelectorAll('*'))]
        .map(element => element.getAttribute('class') ?? '').join(' '))

      expect(classes).not.toMatch(/\b(?:bg-gradient|from-|to-secondary|backdrop-|blur|shadow|ring-primary)/)
      // No overlay: the bar is the whole surface, pinned to the bottom edge, and dims nothing.
      expect(await page.locator('[data-consent-overlay]').count()).toBe(0)
      expect(classes).not.toMatch(/\bbg-black/)
      expect(await bar.getAttribute('class')).not.toMatch(/\binset-0\b/)
      expect(await bar.getAttribute('class')).toMatch(/\bfixed\b/)
      expect(await bar.getAttribute('class')).toMatch(/\binset-x-0\b/)
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

  test('the bar is short: a visitor can read the page and use it without answering', async () => {
    const { page, close } = await mountComponent({ url: `${base}/` })
    try {
      const bar = page.locator('[data-consent-bar]')
      await bar.waitFor()

      // The description is the halved copy: two short sentences, never the old paragraph.
      expect((await bar.locator('#cc-bar-desc').innerText()).length).toBeLessThan(200)

      // The page behind the bar answers the pointer; the bar stays, and nothing was decided.
      await page.locator('#remount').click({ timeout: 3_000 })
      expect(await page.locator('#generation').innerText()).toBe('1')
      expect(await bar.count()).toBe(1)
      expect(await stored(page)).toBeNull()
    } finally {
      await close()
    }
  }, TIMEOUT)

  test.each(['light', 'dark'])('styled (%s): the bar sits at the very bottom and dims nothing', async theme => {
    const { page, close } = await mountComponent({ url: `${base}/?styled=1&theme=${theme}` })
    try {
      const bar = page.locator('[data-consent-bar]')
      await bar.waitFor()
      const viewport = page.viewportSize()!
      const box = (await bar.boundingBox())!

      expect(Math.round(box.y + box.height)).toBe(viewport.height)
      expect(Math.round(box.width)).toBe(viewport.width)
      // The bar is a strip, not a screen: the top of the page is still the page.
      expect(box.y).toBeGreaterThan(0)
      const behind = await page.evaluate(() => {
        const hit = document.elementFromPoint(10, 10)

        return {
          inConsent: hit?.closest('[data-consent-dialog]') != null,
          overlay: hit?.closest('[data-consent-overlay]') != null,
          background: hit == null ? null : getComputedStyle(hit).backgroundColor,
        }
      })
      expect(behind.inConsent).toBe(false)
      expect(behind.overlay).toBe(false)
      expect(await bar.evaluate(root => getComputedStyle(root).opacity)).toBe('1')
      // The remount button above the bar can be pressed.
      await page.locator('#remount').click({ timeout: 3_000 })
      expect(await page.locator('#generation').innerText()).toBe('1')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the page can always be scrolled out from under the bar: the body is padded by its height until it is answered', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?styled=1` })
    try {
      const bar = page.locator('[data-consent-bar]')
      await bar.waitFor()
      const measure = async () => await page.evaluate(() => ({
        padding: Number.parseFloat(getComputedStyle(document.body).paddingBottom),
        bar: Math.ceil(document.querySelector('[data-consent-bar]')!.getBoundingClientRect().height),
        inline: document.body.style.paddingBottom,
      }))

      const open = await measure()
      expect(open.bar).toBeGreaterThan(0)
      expect(open.padding).toBe(open.bar)

      // It follows the bar: a narrower window wraps the text onto more lines and the bar grows.
      await page.setViewportSize({ width: 320, height: 640 })
      await page.waitForFunction(() => {
        const height = Math.ceil(document.querySelector('[data-consent-bar]')!.getBoundingClientRect().height)

        return Number.parseFloat(getComputedStyle(document.body).paddingBottom) === height
      })
      const narrow = await measure()
      expect(narrow.bar).toBeGreaterThan(open.bar)

      // Answered: not a trace of it is left on the body.
      await page.locator('[data-consent-mandatory]').click()
      await page.waitForSelector('[data-consent-bar]', { state: 'detached' })
      expect(await page.evaluate(() => document.body.style.paddingBottom)).toBe('')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the padding the page already had stays under the bar\'s and comes back with it', async () => {
    const browser = await browserHelper.launchBrowser()
    const context = await browser.newContext()
    // The page has a bottom padding of its own before the bar ever mounts.
    await context.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (document.body != null) {
          document.body.style.paddingBottom = '12px'
          observer.disconnect()
        }
      })
      observer.observe(document, { childList: true, subtree: true })
    })
    const page = await context.newPage()
    await page.goto(`${base}/?styled=1`, { waitUntil: 'domcontentloaded' })
    const close = async (): Promise<void> => { await context.close() }
    try {
      const bar = page.locator('[data-consent-bar]')
      await bar.waitFor()
      // The page's 12px under the bar's own height — followed while the bar settles (fonts, wrapping).
      await page.waitForFunction(() => {
        const height = Math.ceil(document.querySelector('[data-consent-bar]')!.getBoundingClientRect().height)

        return Number.parseFloat(getComputedStyle(document.body).paddingBottom) === 12 + height
      })

      await page.locator('[data-consent-accept-all]').click()
      await page.waitForSelector('[data-consent-bar]', { state: 'detached' })
      expect(await page.evaluate(() => document.body.style.paddingBottom)).toBe('12px')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('"Cookie preferences" swaps the bar for the modal window, which reserves nothing', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?styled=1` })
    try {
      await page.locator('[data-consent-bar]').waitFor()
      expect(await page.evaluate(() => document.body.style.paddingBottom)).not.toBe('')

      await page.locator('[data-consent-preferences]').click()
      await page.locator('[data-consent-dialog][data-consent-mode="window"]').waitFor()

      expect(await page.evaluate(() => document.body.style.paddingBottom)).toBe('')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('keyboard: the bar takes no focus and Tab passes through it into the rest of the page', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?styled=1` })
    try {
      await page.waitForSelector('[data-consent-bar]')
      // A non-modal bar never steals focus on open (it would be a nudge toward an answer).
      expect(await page.evaluate(() =>
        document.activeElement?.closest('[data-consent-bar]') != null)).toBe(false)

      const inside: boolean[] = []
      for (let press = 0; press < 14; press++) {
        await page.keyboard.press('Tab')
        inside.push(await page.evaluate(() =>
          document.activeElement?.closest('[data-consent-bar]') != null))
      }
      // Tab reaches the bar's own controls ...
      expect(inside).toContain(true)
      // ... and leaves them again: a keyboard user is never trapped in a bar that blocks nothing.
      const first = inside.indexOf(true)
      expect(inside.slice(first)).toContain(false)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('"Cookie preferences" replaces the bar with the modal window, which does block the page', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?styled=1` })
    try {
      await page.waitForSelector('[data-consent-bar]')
      await page.locator('[data-consent-preferences]').click()
      const dialog = page.locator('[data-consent-dialog][data-consent-mode="window"]')
      await dialog.waitFor()

      expect(await page.locator('[data-consent-bar]').count()).toBe(0)
      expect(await dialog.getAttribute('aria-modal')).toBe('true')
      expect(await dialog.getAttribute('class')).toContain('bg-black/70')
      await expect(page.locator('#remount').click({ timeout: 1_000 })).rejects.toThrow()
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
