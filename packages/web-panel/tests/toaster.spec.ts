import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

// Browser work does not fit the 5s default: a cold harness compiles the app on first request.
const TIMEOUT = 30_000

afterAll(async () => {
  await closeBrowser()
})

const open = async (path: string) => mountComponent({ url: `${HARNESS_URL.replace(/\/$/, '')}${path}` })

describe('@owlmeans/web-panel — the toast surface', () => {
  test('an action reports its outcome, once, through the layout-mounted Toaster', async () => {
    // The whole point of shipping the Toaster from the panel: a screen calls `toast()` from
    // `sonner` and something the LAYOUT mounted renders it. Both failure modes are silent —
    // no mount renders nothing at all, two mounts render every message twice — so the count
    // is asserted rather than the mere presence.
    const { page, close } = await open('/prefs')
    try {
      await page.waitForSelector('#prefs')
      await page.locator('#fire-toast').click()

      const toast = page.locator('[data-sonner-toast]')
      await toast.first().waitFor({ state: 'visible' })
      expect(await page.locator('[data-sonner-toaster]').count()).toBe(1)
      expect(await toast.count()).toBe(1)
      expect(await toast.first().textContent()).toContain('preferences saved')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the toasts follow the document theme class', async () => {
    // The panel reads `.dark` off the document element rather than a theme provider's hook, so
    // it follows next-themes, the owl theme provider and a hand-set class alike. A toast painted
    // in the wrong theme is the visible half; the invisible half is a package that would have
    // forced `next-themes` on every consumer.
    const { page, close } = await open('/prefs')
    try {
      await page.waitForSelector('#prefs')
      await page.locator('#fire-sticky').click()
      // The toast is what becomes visible; the list around it is a zero-box positioning
      // container, so waiting on the list itself never resolves.
      await page.locator('[data-sonner-toast]').first().waitFor({ state: 'visible' })
      const toaster = page.locator('[data-sonner-toaster]')
      expect(await toaster.getAttribute('data-sonner-theme')).toBe('light')

      await page.evaluate(() => document.documentElement.classList.add('dark'))
      await page.waitForFunction(
        () => document.querySelector('[data-sonner-toaster]')?.getAttribute('data-sonner-theme') === 'dark'
      )
      expect(await toaster.getAttribute('data-sonner-theme')).toBe('dark')
    } finally {
      await close()
    }
  }, TIMEOUT)
})
