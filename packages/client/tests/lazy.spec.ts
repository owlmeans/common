import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import type { Page } from '@owlmeans/test-ui'
import { CHUNK_RELOAD_KEY } from '../src/consts.js'
import { HARNESS_URL } from './context.js'

// Browser work does not fit the 5s default: a cold harness compiles the app on first request.
const TIMEOUT = 30_000

const open = (component: string) => mountComponent({ url: HARNESS_URL, component })

const loadsOf = (page: Page) => page.evaluate(() => (window as unknown as { __loads: { count: number } }).__loads.count)

/** The documents this tab went through. A read that lands mid-reload is taken again. */
const bootsOf = async (page: Page): Promise<number> => {
  for (let tries = 0; ; tries++) {
    try {
      return Number(await page.evaluate(() => sessionStorage.getItem('harness:boots')))
    } catch (error) {
      if (tries > 100) throw error
      await Bun.sleep(50)
    }
  }
}

afterAll(async () => {
  await closeBrowser()
})

// A cold Vite server transforms the harness and optimizes its dependencies on the first request,
// and may reload the page while it does — which a spec counting its own reloads cannot absorb.
beforeAll(async () => {
  const { page, close } = await open('recovers')
  try {
    await page.waitForSelector('#piece')
  } finally {
    await close()
  }
}, TIMEOUT)

describe('@owlmeans/client — a lazily-loaded piece whose chunk fails', () => {
  test('a chunk failure is retried in place, and the piece renders without an error', async () => {
    const { page, close } = await open('recovers')
    try {
      await page.waitForSelector('#piece')

      expect(await page.locator('#piece').textContent()).toBe('recovers')
      expect(await loadsOf(page)).toBe(3)
      expect(await page.locator('#app-tripped').count()).toBe(0)
      expect(await bootsOf(page)).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a chunk the browser refuses to fetch again loads from its cache-busted URL', async () => {
    const { page, close } = await open('busted')
    try {
      await page.waitForSelector('#piece')

      expect(await page.locator('#piece').textContent()).toBe('busted')
      expect(await loadsOf(page)).toBe(1)
      expect(await page.locator('#app-tripped').count()).toBe(0)
      expect(await bootsOf(page)).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('without `error`, a chunk that failed for good reloads the page once and never trips the app', async () => {
    const { page, close } = await open('no-surface')
    try {
      const deadline = Date.now() + 10_000
      while (await bootsOf(page) < 2 && Date.now() < deadline) {
        await Bun.sleep(50)
      }
      expect(await bootsOf(page)).toBe(2)

      // The second document fails the same way; the guard refuses a second reload.
      await page.waitForFunction(() => (window as unknown as { __loads: { count: number } }).__loads.count === 3)
      await Bun.sleep(300)

      expect(await bootsOf(page)).toBe(2)
      expect(await page.evaluate(key => sessionStorage.getItem(key) != null, CHUNK_RELOAD_KEY)).toBe(true)
      expect(await page.locator('#fallback').textContent()).toBe('plain')
      expect(await page.locator('#sibling').isVisible()).toBe(true)
      expect(await page.locator('#app-tripped').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('with `reload`, a screen whose chunk failed for good reloads once, then shows its `error`', async () => {
    const { page, close } = await open('screen')
    try {
      const deadline = Date.now() + 10_000
      while (await bootsOf(page) < 2 && Date.now() < deadline) {
        await Bun.sleep(50)
      }
      expect(await bootsOf(page)).toBe(2)

      // The second document fails the same way; the guard refuses a second reload, so the surface shows.
      await page.waitForSelector('#notice')
      expect(await page.locator('#app-tripped').count()).toBe(0)
      expect(await page.locator('#sibling').count()).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('without `error`, any other failure reaches the application\'s boundary, unretried', async () => {
    const { page, close } = await open('broken')
    try {
      await page.waitForSelector('#app-tripped')

      expect(await page.locator('#app-tripped').textContent()).toBe('module evaluation failed')
      expect(await loadsOf(page)).toBe(1)
      expect(await bootsOf(page)).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('`error` renders in place with the failure, and its `retry()` loads the chunk again', async () => {
    const { page, close } = await open('retryable')
    try {
      await page.waitForSelector('#retry')

      expect(await page.locator('#retry').getAttribute('data-error')).toContain('Failed to fetch dynamically imported module')
      expect(await loadsOf(page)).toBe(3)
      expect(await page.locator('#sibling').isVisible()).toBe(true)

      await page.locator('#retry').click()
      await page.waitForSelector('#piece')

      expect(await page.locator('#piece').textContent()).toBe('retryable')
      expect(await loadsOf(page)).toBe(4)
      expect(await page.locator('#retry').count()).toBe(0)
      expect(await page.locator('#app-tripped').count()).toBe(0)
      expect(await bootsOf(page)).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)
})
