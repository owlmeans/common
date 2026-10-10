import { afterAll, describe, expect, test } from 'bun:test'
import { mountComponent, browserHelper } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

const TIMEOUT = 30_000

afterAll(async () => {
  await browserHelper.closeBrowser()
})

const open = async (path: string) => mountComponent({ url: `${HARNESS_URL.replace(/\/$/, '')}${path}` })

describe('@owlmeans/web-panel/consent — the dialog and the menu widget', () => {
  test('the dialog works on a context without the presence service and keeps its floating button', async () => {
    // `?consent=bare` never appends `appendConsentWidgetService` — an application using the
    // dialog on its own. The footer still renders the "Cookie settings" control, whose presence
    // hook has nothing to claim. Neither may throw: a throw in render blanks the application.
    const { page, close } = await open('/prefs?consent=bare&footer=node')
    try {
      await page.waitForSelector('#prefs')
      await page.locator('[data-consent-dialog]').waitFor()
      await page.locator('[data-consent-accept-all]').click()
      await page.locator('[data-consent-reopen]').waitFor()
      expect(await page.locator('[data-consent-dialog]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a mounted footer control hides the floating button and reopens the dialog', async () => {
    // `?consent=menu` appends the presence service; the footer's control declares itself with
    // `useConsentMenuPresence()` for as long as it is mounted, so the floating button stays away.
    const { page, close } = await open('/prefs?consent=menu&footer=node')
    try {
      await page.waitForSelector('#prefs')
      await page.locator('[data-consent-dialog]').waitFor()
      await page.locator('[data-consent-accept-all]').click()
      await page.locator('[data-consent-dialog]').waitFor({ state: 'detached' })
      expect(await page.locator('[data-consent-reopen]').count()).toBe(0)

      await page.locator('footer').getByRole('button', { name: 'Cookie settings' }).click()
      await page.locator('[data-consent-dialog]').waitFor()
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('linker passes through to the underlying dialog unchanged', async () => {
    // `?domains=1` hands `PanelCookieConsent` a `linker` — nothing here re-derives it, so seeing
    // the domain line pins that `{...props}` still carries it all the way to `CookieConsent`.
    const { page, close } = await open('/prefs?consent=bare&footer=node&domains=1')
    try {
      await page.waitForSelector('#prefs')
      await page.locator('[data-consent-dialog]').waitFor()
      const domains = page.locator('[data-consent-domains]')
      await domains.waitFor()
      expect(await domains.textContent()).toContain('harness-partner.test')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a first-time visitor meets the bar by default', async () => {
    const { page, close } = await open('/prefs?consent=bare')
    try {
      await page.locator('[data-consent-bar]').waitFor()
      expect(await page.locator('[data-consent-dialog]').getAttribute('data-consent-mode')).toBe('bar')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('cfg.cookieConsent.mode picks the window, and a mode prop wins over it', async () => {
    const configured = await open('/prefs?consent=bare&consentCfg=window')
    try {
      await configured.page.locator('[data-consent-dialog][data-consent-mode="window"]').waitFor()
    } finally {
      await configured.close()
    }

    const overridden = await open('/prefs?consent=bare&consentCfg=window&modeProp=bar')
    try {
      await overridden.page.locator('[data-consent-bar]').waitFor()
    } finally {
      await overridden.close()
    }
  }, TIMEOUT)

  test('a locator appended to the context turns the geo gate on by itself', async () => {
    const outside = await open('/prefs?consent=bare&consentGeo=US')
    try {
      await outside.page.waitForFunction(() => document.documentElement.getAttribute('data-consent') === 'decided')
      expect(await outside.page.locator('[data-consent-dialog]').count()).toBe(0)
    } finally {
      await outside.close()
    }

    const inside = await open('/prefs?consent=bare&consentGeo=DE')
    try {
      await inside.page.locator('[data-consent-bar]').waitFor()
    } finally {
      await inside.close()
    }

    const unknown = await open('/prefs?consent=bare&consentGeo=fail')
    try {
      await unknown.page.locator('[data-consent-bar]').waitFor()
    } finally {
      await unknown.close()
    }
  }, TIMEOUT)
})
