import { afterAll, describe, expect, test } from 'bun:test'
import { mountComponent, browserHelper, makePageHelper, consentGeoTestHelper } from '@owlmeans/test-ui'
import type { Page } from '@owlmeans/test-ui'
import { CONSENT_AUTO_MAX_AGE, CONSENT_KEY, CONSENT_SCHEMA_VERSION } from '@owlmeans/consent'
import { HARNESS_URL } from './context.js'

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

const phase = async (page: Page): Promise<string | null> =>
  await page.evaluate(() => document.documentElement.getAttribute('data-consent'))

const settled = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const value = document.documentElement.getAttribute('data-consent')

    return value === 'open' || value === 'decided'
  })
}

/** A page that boots with `record` in storage — seeded on the origin, then reloaded. */
const seeded = async (record: Record<string, unknown>, query: string) => {
  const mounted = await mountComponent({ url: `${base}/`, waitUntil: 'commit' })
  await mounted.page.evaluate(([key, value]) => window.localStorage.setItem(key, value),
    [CONSENT_KEY, JSON.stringify(record)] as [string, string])
  const traces: string[] = []
  mounted.page.on('request', request => {
    if (request.url().includes('/cdn-cgi/trace')) traces.push(request.url())
  })
  await mounted.page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded' })

  return { ...mounted, traces }
}

describe('@owlmeans/web-consent — asking only where the law requires it', () => {
  test('while the visitor is located: the transparent overlay and a spinner, never the bar', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?geo=DE&geoDelay=4000&geoTimeout=20000` })
    try {
      await page.waitForSelector('[data-consent-locating="first"]')

      expect(await phase(page)).toBe('locating')
      expect(await page.locator('[data-consent-dialog]').count()).toBe(0)
      expect(await page.locator('[data-consent-reopen]').count()).toBe(0)
      // The spinner itself only after a beat, so a quick answer flashes nothing.
      await page.waitForSelector('[data-consent-spinner]')
      expect(await page.locator('[data-consent-locating]').getAttribute('class')).toMatch(/\bbg-transparent\b/)

      await page.waitForSelector('[data-consent-bar]', { timeout: 15_000 })
      expect(await page.locator('[data-consent-locating]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('outside the consent countries: no UI at all, everything granted automatically', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?geo=US` })
    try {
      await settled(page)

      expect(await phase(page)).toBe('decided')
      expect(await page.locator('[data-consent-dialog]').count()).toBe(0)
      const record = await stored(page)
      expect(record).toMatchObject({ essential: true, analytics: true, marketing: true })
      expect(typeof record?.auto).toBe('number')
      const update = await page.evaluate(() => ((window as never as { dataLayer?: unknown[] }).dataLayer ?? [])
        .map(item => Array.from(item as ArrayLike<unknown>)).filter(entry => entry[1] === 'update').pop()?.[2])
      expect(update).toMatchObject({ analytics_storage: 'granted' })
      // The visitor can still change it — the corner button is there.
      await page.waitForSelector('[data-consent-reopen]')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('inside the consent countries: the bar', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?geo=DE` })
    try {
      await page.waitForSelector('[data-consent-bar]')

      expect(await stored(page)).toBeNull()
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a visitor nobody can locate is asked: unknown codes, no Cloudflare, an HTML fallback, a hang', async () => {
    for (const query of ['geo=XX', 'geo=T1', 'geo=fail', 'geo=html', 'geo=hang&geoTimeout=600']) {
      const { page, close } = await mountComponent({ url: `${base}/?${query}` })
      try {
        await page.waitForSelector('[data-consent-bar]', { timeout: 15_000 })

        expect({ query, record: await stored(page) }).toEqual({ query, record: null })
      } finally {
        await close()
      }
    }
  }, TIMEOUT * 2)

  test('Global Privacy Control: the automatic decision is mandatory-only', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?geo=US&gpc=1` })
    try {
      await settled(page)

      expect(await stored(page)).toMatchObject({ essential: true, analytics: false, marketing: false })
      expect(await page.locator('[data-consent-dialog]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('an application locator decides on its own, and Cloudflare answers when it cannot', async () => {
    const own = await mountComponent({ url: `${base}/?geoPlugin=JP` })
    try {
      await settled(own.page)
      expect(await phase(own.page)).toBe('decided')
    } finally {
      await own.close()
    }

    const fallback = await mountComponent({ url: `${base}/?geoPlugin=fail&geo=US` })
    try {
      await settled(fallback.page)
      expect(await phase(fallback.page)).toBe('decided')
    } finally {
      await fallback.close()
    }

    const neither = await mountComponent({ url: `${base}/?geoPlugin=fail&geo=fail` })
    try {
      await neither.page.waitForSelector('[data-consent-bar]')
    } finally {
      await neither.close()
    }
  }, TIMEOUT)

  test('a stored decision is never located', async () => {
    const { page, close, traces } = await seeded(
      { essential: true, analytics: false, marketing: false, v: CONSENT_SCHEMA_VERSION }, '?geo=US'
    )
    try {
      await page.waitForSelector('[data-consent-reopen]')

      expect(traces).toEqual([])
      expect(await stored(page)).toMatchObject({ analytics: false })
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a stale automatic decision applies nothing from the head and is re-checked: in a consent country, asked', async () => {
    const stale = Math.floor(Date.now() / 1000) - CONSENT_AUTO_MAX_AGE - 60
    const { page, close } = await seeded(
      { essential: true, analytics: true, marketing: true, v: CONSENT_SCHEMA_VERSION, auto: stale }, '?geo=DE'
    )
    try {
      await page.waitForSelector('[data-consent-bar]')

      // The inline bootstrap read the record before any bundle and must NOT have applied it.
      const updates = await page.evaluate(() => ((window as never as { dataLayer?: unknown[] }).dataLayer ?? [])
        .map(item => Array.from(item as ArrayLike<unknown>)).filter(entry => entry[1] === 'update'))
      expect(updates).toEqual([])
      expect(await stored(page)).toBeNull()
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a stale automatic decision still outside the consent countries is renewed silently', async () => {
    const stale = Math.floor(Date.now() / 1000) - CONSENT_AUTO_MAX_AGE - 60
    const { page, close } = await seeded(
      { essential: true, analytics: true, marketing: true, v: CONSENT_SCHEMA_VERSION, auto: stale }, '?geo=US'
    )
    try {
      await page.waitForFunction(() => document.documentElement.getAttribute('data-consent') === 'decided')

      expect(await page.locator('[data-consent-locating="first"]').count()).toBe(0)
      expect((await stored(page))?.auto).toBeGreaterThan(stale)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('reopening an automatic decision says it was automatic, with the switches as they are', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?geo=US` })
    try {
      await page.locator('[data-consent-reopen]').click()
      await page.waitForSelector('[data-consent-auto]')

      expect(await page.getByRole('checkbox', { name: 'Analytics Cookies' }).isChecked()).toBe(true)
      await page.getByRole('checkbox', { name: 'Marketing Cookies' }).uncheck({ force: true })
      await page.locator('[data-consent-save]').click()
      await page.waitForSelector('[data-consent-reopen]')

      const record = await stored(page)
      expect(record).toMatchObject({ analytics: true, marketing: false })
      // Saved by the visitor: an explicit decision from now on.
      expect(record?.auto).toBeUndefined()
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the policy page states the regional rule only while the gate is on', async () => {
    const withGeo = await mountComponent({ url: `${base}/?view=policy&geo=DE` })
    try {
      await withGeo.page.waitForSelector('[data-cookie-policy-regional]')
    } finally {
      await withGeo.close()
    }

    const without = await mountComponent({ url: `${base}/?view=policy` })
    try {
      await without.page.waitForSelector('[data-cookie-policy]')
      expect(await without.page.locator('[data-cookie-policy-regional]').count()).toBe(0)
    } finally {
      await without.close()
    }
  }, TIMEOUT)
})

describe('@owlmeans/test-ui — the consent helpers', () => {
  test('mockConsentGeo answers in place of the endpoint and counts the calls', async () => {
    // The harness endpoint would answer 404 (`geo=fail`); the mock answers first.
    const { page, close } = await mountComponent({ url: `${base}/?geo=fail`, consentGeo: 'US' })
    try {
      await settled(page)

      expect(await phase(page)).toBe('decided')
      expect(await consentGeoTestHelper.traceCalls(page)).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('acceptConsent answers the bar, and returns false at once for an automatic decision', async () => {
    const asked = await mountComponent({ url: `${base}/?geo=fail`, consentGeo: { country: 'PL', delayMs: 1_000 } })
    try {
      expect(await makePageHelper(asked.page).acceptConsent({ timeout: 20_000 })).toBe(true)
      expect(await stored(asked.page)).toMatchObject({ analytics: true })
    } finally {
      await asked.close()
    }

    const automatic = await mountComponent({ url: `${base}/?geo=fail`, consentGeo: 'US' })
    try {
      const started = Date.now()
      expect(await makePageHelper(automatic.page).acceptConsent({ timeout: 30_000 })).toBe(false)
      expect(Date.now() - started).toBeLessThan(10_000)
    } finally {
      await automatic.close()
    }
  }, TIMEOUT)
})
