import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

const TIMEOUT = 30_000

afterAll(async () => {
  await closeBrowser()
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
})
