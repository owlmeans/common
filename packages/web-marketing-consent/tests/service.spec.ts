import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser } from '@owlmeans/test-ui'
import { open, statusView, TIMEOUT } from './helpers.js'

afterAll(async () => { await closeBrowser() })

/** Drives the REAL `MarketingConsentClientService` registered in the harness (`window.__mc`, see
 * `tests/harness/mount.tsx`) rather than a hand-built fake context — the service depends on
 * `assertCtx`/`context.service`/`context.entrypoint`, which only a real OwlMeans context wires up. */
describe('MarketingConsentClientService — fail-open, never throws into the caller', () => {
  test('signed out: every method resolves the safe default, and the API is never called', async () => {
    const { page, calls, close } = await open('/')
    try {
      // Wait for the app to finish mounting before evaluating — `domcontentloaded` fires as soon
      // as the module script STARTS running, not once its own top-level awaits (writing the
      // `?bearer=` record, in a signed-in open) have settled.
      await page.locator('#home').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await page.evaluate(async () => await (window as any).__mc.status())).toBeNull()
      expect(
        await page.evaluate(async () => await (window as any).__mc.save([{ key: 'marketing.email', granted: true }]))
      ).toBeNull()
      expect(await page.evaluate(async () => await (window as any).__mc.recordTerms())).toBe(false)
      expect(await page.evaluate(async () => await (window as any).__mc.token())).toBeNull()

      expect(calls).toEqual([])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('signed in, a healthy server: status/save/recordTerms all resolve their real values', async () => {
    const view = statusView()
    const { page, close } = await open('/', {
      signedIn: true,
      stubs: {
        status: { json: view },
        save: { json: { ok: true, status: view } },
        terms: { json: { ok: true } },
      },
    })
    try {
      await page.locator('#home').waitFor({ state: 'visible', timeout: 45_000 })

      const status = await page.evaluate(async () => await (window as any).__mc.status(true))
      expect(status?.items?.length).toBe(view.items.length)

      const saved = await page.evaluate(
        async () => await (window as any).__mc.save([{ key: 'marketing.email', granted: true }])
      )
      expect(saved?.items?.length).toBe(view.items.length)

      expect(await page.evaluate(async () => await (window as any).__mc.recordTerms())).toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('signed in, a failing server: every method fails open instead of throwing', async () => {
    const { page, close } = await open('/', {
      signedIn: true,
      stubs: {
        status: { status: 500, error: 'boom' },
        save: { status: 500, error: 'boom' },
        terms: { status: 500, error: 'boom' },
      },
    })
    try {
      await page.locator('#home').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await page.evaluate(async () => await (window as any).__mc.status(true))).toBeNull()
      expect(
        await page.evaluate(async () => await (window as any).__mc.save([{ key: 'marketing.email', granted: true }]))
      ).toBeNull()
      expect(await page.evaluate(async () => await (window as any).__mc.recordTerms())).toBe(false)
    } finally {
      await close()
    }
  }, TIMEOUT)
})
