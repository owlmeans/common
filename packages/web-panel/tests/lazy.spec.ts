import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

// Browser work does not fit the 5s default: a cold harness compiles the app on first request.
const TIMEOUT = 30_000

// The lazy screen's alias as the harness declares it (`${SERVICE}:web:lazy`).
const LAZY_ALIAS = 'web-panel-test:web:lazy'
// The request the lazy screen's chunk arrives by — the harness's own module, served by Vite.
const LAZY_MODULE = '**/lazy-screen.tsx*'

afterAll(async () => {
  await closeBrowser()
})

const open = async (path: string) => mountComponent({ url: `${HARNESS_URL.replace(/\/$/, '')}${path}` })

describe('@owlmeans/web-panel — lazily-loaded screens', () => {
  test('the fallback renders inside the layout, and the layout survives the load', async () => {
    const { page, close } = await open('/lazy-entry')
    try {
      await page.waitForSelector('#lazy-entry')

      // Hold the chunk's request open, so the fallback is observable for as long as the test needs.
      let release!: () => void
      const held = new Promise<void>(resolve => { release = resolve })
      await page.route(LAZY_MODULE, async route => {
        await held
        await route.continue()
      })

      await page.locator('#to-lazy').click()
      await page.waitForSelector('#lazy-fallback')
      // The boundary is the lazy screen's own: the shell stays up and the fallback sits in it.
      expect(await page.locator('header nav').first().isVisible()).toBe(true)
      expect(await page.locator('main #lazy-fallback').count()).toBe(1)

      // Keep the layout's header node itself — a remount would replace it with a fresh one.
      await page.evaluate(() => {
        const header = document.querySelector('header')!
        header.setAttribute('data-lazy-mark', '1')
        ;(window as unknown as { __header: Element }).__header = header
      })

      release()
      await page.waitForSelector('#lazy-screen')

      expect(await page.locator('#lazy-fallback').count()).toBe(0)
      expect(await page.locator('header[data-lazy-mark]').count()).toBe(1)
      expect(await page.evaluate(() => {
        const kept = (window as unknown as { __header: Element }).__header
        return kept.isConnected && document.querySelector('header') === kept
      })).toBe(true)
      expect(await page.locator('#lazy-screen').getAttribute('data-alias')).toBe(LAZY_ALIAS)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a preloaded screen renders without its fallback', async () => {
    const { page, close } = await open('/lazy-entry')
    try {
      await page.waitForSelector('#lazy-entry')
      expect(await page.evaluate(() => (window as unknown as { __lazyPreload: () => Promise<boolean> }).__lazyPreload())).toBe(true)

      // Records every node ever added, so a fallback that is mounted and replaced in the same
      // task still counts — reading the DOM afterwards would miss it.
      await page.evaluate(() => {
        const flags = window as unknown as { __fallbackSeen: boolean }
        flags.__fallbackSeen = false
        new MutationObserver(records => {
          for (const record of records) {
            for (const node of Array.from(record.addedNodes)) {
              if (node instanceof Element && (node.id === 'lazy-fallback' || node.querySelector('#lazy-fallback') != null)) {
                flags.__fallbackSeen = true
              }
            }
          }
        }).observe(document.body, { childList: true, subtree: true })
      })

      await page.locator('#to-lazy').click()
      await page.waitForSelector('#lazy-screen')
      expect(await page.evaluate(() => (window as unknown as { __fallbackSeen: boolean }).__fallbackSeen)).toBe(false)
      expect(await page.locator('#lazy-screen').getAttribute('data-alias')).toBe(LAZY_ALIAS)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a failed load is retried, not cached', async () => {
    const { page, close } = await open('/lazy-entry')
    try {
      await page.waitForSelector('#lazy-entry')
      const preload = () => page.evaluate(() => (window as unknown as { __flakyPreload: () => Promise<string> }).__flakyPreload())

      expect(await preload()).toBe('first-load-fails')
      expect(await preload()).toBe('loaded')
    } finally {
      await close()
    }
  }, TIMEOUT)
})
