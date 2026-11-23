import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { browserHelper } from '@owlmeans/test-ui'
import type { Page } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

// Browser work does not fit the 5s default: a cold harness compiles the app on first request.
const TIMEOUT = 30_000

const ROUTE_URL = new URL('route/', HARNESS_URL).toString()

interface Probe {
  mounts: Record<'layout' | 'host' | 'screen' | 'item', number>
  results: unknown[]
  stack: number
}

const probeOf = (page: Page): Promise<Probe> => page.evaluate(() => {
  const probe = (window as unknown as {
    __route: { mounts: Probe['mounts'], results: unknown[], stack: () => number }
  }).__route
  return { mounts: { ...probe.mounts }, results: [...probe.results], stack: probe.stack() }
})

const openRoute = async (page: Page): Promise<void> => {
  await page.goto(ROUTE_URL)
  await page.waitForSelector('#screen')
  // The host links itself to the modal service from an effect: wait for it before opening.
  await page.waitForFunction(() => (window as unknown as { __route: Probe }).__route.mounts.host === 1)
}

afterAll(async () => {
  await browserHelper.closeBrowser()
})

// A cold Vite server optimizes dependencies on the first request and may reload the page.
beforeAll(async () => {
  await browserHelper.withPage(openRoute)
}, TIMEOUT)

describe('@owlmeans/client — a route renderer across navigations', () => {
  test('a query-only navigation keeps the layout, the screen and an open modal mounted', async () => {
    await browserHelper.withPage(async page => {
      await openRoute(page)

      await page.click('#open-modal')
      await page.waitForSelector('#dialog')

      await page.click('#nav-tab-a')
      await page.waitForSelector('#screen[data-tab="a"]')
      await page.click('#nav-tab-b')
      await page.waitForSelector('#screen[data-tab="b"]')

      expect(new URL(page.url()).search).toBe('?tab=b')
      expect(await page.locator('#dialog').count()).toBe(1)
      expect(await probeOf(page)).toEqual({
        mounts: { layout: 1, host: 1, screen: 1, item: 0 }, results: [], stack: 1,
      })
    })
  }, TIMEOUT)

  test('the modal kept open across a navigation still closes and clears its stack entry', async () => {
    await browserHelper.withPage(async page => {
      await openRoute(page)

      await page.click('#open-modal')
      await page.waitForSelector('#dialog')
      await page.click('#nav-tab-a')
      await page.waitForSelector('#screen[data-tab="a"]')

      await page.click('#dialog-cancel')
      await page.waitForSelector('#dialog', { state: 'detached' })
      await page.waitForFunction(() => (window as unknown as { __route: Probe }).__route.results.length === 1)

      const probe = await probeOf(page)
      expect(probe.stack).toBe(0)
      expect(probe.results).toEqual([null])
    })
  }, TIMEOUT)

  test('moving between screens keeps the layout and the modal host mounted', async () => {
    await browserHelper.withPage(async page => {
      await openRoute(page)

      await page.click('#nav-item-1')
      await page.waitForSelector('#item[data-id="1"]')
      await page.click('#nav-item-2')
      await page.waitForSelector('#item[data-id="2"]')
      await page.click('#nav-home')
      await page.waitForSelector('#screen')

      // The item route rendered once for both ids: a changed parameter re-renders its screen.
      expect((await probeOf(page)).mounts).toEqual({ layout: 1, host: 1, screen: 2, item: 1 })
    })
  }, TIMEOUT)
})
