import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

// Browser work does not fit the 5s default: a cold harness compiles the app on first request.
const TIMEOUT = 30_000

afterAll(async () => {
  await closeBrowser()
})

const open = async (path: string) => mountComponent({ url: `${HARNESS_URL.replace(/\/$/, '')}${path}` })

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
