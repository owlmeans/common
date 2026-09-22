import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

// Browser work does not fit the 5s default: a cold harness compiles the app on first request.
const TIMEOUT = 30_000

afterAll(async () => {
  await closeBrowser()
})

const open = async (path: string) => mountComponent({ url: `${HARNESS_URL.replace(/\/$/, '')}${path}` })

type Page = Awaited<ReturnType<typeof open>>['page']

// The modal overlay covers the harness buttons and would take a pointer click itself.
const clickBehindDialog = async (page: Page, selector: string) =>
  page.evaluate(sel => document.querySelector<HTMLButtonElement>(sel)?.click(), selector)

const revivedCount = async (page: Page, count: number) =>
  page.waitForFunction(n => document.querySelector('#revived')?.textContent === String(n), count)

const retryDisabled = async (page: Page, disabled: boolean) => page.waitForFunction(
  d => document.querySelector<HTMLButtonElement>('[data-socket-retry-action]')?.disabled === d, disabled
)

describe('@owlmeans/web-panel — the socket reload dialog', () => {
  test('stays unmounted until the connection is reported lost', async () => {
    const { page, close } = await open('/socket')
    try {
      await page.waitForSelector('#socket-status')
      expect(await page.locator('[data-socket-reload-dialog]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('opens on "lost", blocks Escape and outside clicks, and Reload reloads the page', async () => {
    const { page, close } = await open('/socket')
    try {
      await page.waitForSelector('#socket-status')
      await page.locator('#report-lost').click()

      const dialog = page.locator('[data-socket-reload-dialog]')
      await dialog.waitFor({ state: 'visible' })

      // Neither Escape nor a click outside the dialog may close it — there is nothing else the
      // budget-exhausted state can resolve into, so the only exit is the action button.
      await page.keyboard.press('Escape')
      expect(await dialog.isVisible()).toBe(true)
      await page.mouse.click(2, 2)
      expect(await dialog.isVisible()).toBe(true)

      // The secondary button's label must be readable, not the primary's text on an outline fill.
      const reloadColors = await page.locator('[data-socket-reload-action]').evaluate(el => {
        const style = getComputedStyle(el)
        return { color: style.color, background: style.backgroundColor }
      })
      expect(reloadColors.color).not.toBe(reloadColors.background)

      const [navigated] = await Promise.all([
        page.waitForEvent('load'),
        page.locator('[data-socket-reload-action]').click(),
      ])
      expect(navigated).toBeTruthy()

      // A fresh boot: the in-memory status service starts at `'online'` again, so the dialog it
      // was showing is gone without anything having to dismiss it.
      await page.waitForSelector('#socket-status')
      expect(await page.locator('[data-socket-reload-dialog]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('Try again revives the lost connection, shows progress, and closes once it is back', async () => {
    const { page, close } = await open('/socket')
    try {
      await page.waitForSelector('#socket-status')
      await page.locator('#report-lost').click()

      const dialog = page.locator('[data-socket-reload-dialog]')
      const retry = page.locator('[data-socket-retry-action]')
      await dialog.waitFor({ state: 'visible' })
      expect(await retry.isEnabled()).toBe(true)

      await retry.click()
      await revivedCount(page, 1)
      await retryDisabled(page, true)
      // Still up while the revived connection is retrying — closing now would read as "fixed".
      expect(await dialog.isVisible()).toBe(true)
      expect(await retry.getAttribute('aria-busy')).toBe('true')

      await clickBehindDialog(page, '#report-online')
      await dialog.waitFor({ state: 'detached' })
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a retry that fails again offers both buttons again', async () => {
    const { page, close } = await open('/socket')
    try {
      await page.waitForSelector('#socket-status')
      await page.locator('#report-lost').click()
      const retry = page.locator('[data-socket-retry-action]')
      await retry.click()
      await retryDisabled(page, true)

      await clickBehindDialog(page, '#report-lost')
      await retryDisabled(page, false)
      expect(await page.locator('[data-socket-reload-dialog]').isVisible()).toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('retries on its own when the tab or window becomes active again', async () => {
    const { page, close } = await open('/socket')
    try {
      await page.waitForSelector('#socket-status')
      await page.locator('#report-lost').click()
      await page.locator('[data-socket-reload-dialog]').waitFor({ state: 'visible' })

      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
      await revivedCount(page, 1)

      // Nothing is lost any more, so a second activation has nothing to revive.
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await page.waitForTimeout(100)
      expect(await page.locator('#revived').textContent()).toBe('1')

      await clickBehindDialog(page, '#report-lost')
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await revivedCount(page, 2)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('never mounts when the app has not opted in via cfg.socket.reloadDialog', async () => {
    const { page, close } = await open('/socket?reloadDialog=0')
    try {
      await page.waitForSelector('#socket-status')
      await page.locator('#report-lost').click()
      // Give a mount a moment it would otherwise use — asserting immediately after a click that
      // triggers no render at all would pass even if the gate were backwards.
      await page.waitForTimeout(200)
      expect(await page.locator('[data-socket-reload-dialog]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)
})
