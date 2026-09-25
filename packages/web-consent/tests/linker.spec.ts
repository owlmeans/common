import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import type { Page } from '@owlmeans/test-ui'
import { CONSENT_KEY, CONSENT_LINK_MAX_AGE, CONSENT_LINK_PARAM, encodeConsentLink } from '@owlmeans/consent'
import { HARNESS_URL } from './context.js'

// Browser work does not fit the 5s default: a cold harness compiles the app on first request.
const TIMEOUT = 60_000

afterAll(async () => {
  await closeBrowser()
})

const base = HARNESS_URL.replace(/\/$/, '')
const PARTNER_ORIGIN = 'https://partner.test'

const nowSeconds = (): number => Math.floor(Date.now() / 1000)

describe('@owlmeans/web-consent — the linker: domain disclosure', () => {
  test('the dialog lists the current host plus every configured partner domain', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?linker=1` })
    try {
      await page.locator('[data-consent-dialog]').waitFor()
      const domains = page.locator('[data-consent-domains]')
      await domains.waitFor()
      const text = await domains.textContent()
      expect(text).toContain('partner.test')
      // The current host — whatever the harness's own origin resolves to (127.0.0.1 or localhost).
      expect(text).toMatch(/localhost|127\.0\.0\.1/)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('without `linker`, no domain line renders at all', async () => {
    const { page, close } = await mountComponent({ url: `${base}/` })
    try {
      await page.locator('[data-consent-dialog]').waitFor()
      expect(await page.locator('[data-consent-domains]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the policy page lists the same domains, as a plain list (not a heading)', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?view=policy&linker=1` })
    try {
      await page.locator('[data-cookie-policy]').waitFor()
      const list = page.locator('[data-cookie-policy-domains]')
      await list.waitFor()
      expect(await page.evaluate(el => el.tagName, await list.elementHandle())).toBe('UL')
      expect(await list.textContent()).toContain('partner.test')
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('@owlmeans/web-consent — the linker: adoption', () => {
  test('a fresh, correctly-referred link is adopted: no dialog, storage written, URL clean', async () => {
    const owlcc = encodeConsentLink({ essential: true, analytics: true, marketing: false })
    const { page, close } = await mountComponent({ url: `${base}/`, waitUntil: 'commit' })
    try {
      await page.goto(`${base}/?linker=1&owlcc=${owlcc}`, {
        waitUntil: 'domcontentloaded', referer: `${PARTNER_ORIGIN}/`,
      })

      // Never asked — a stored record exists before the dialog could ever open.
      await page.locator('[data-consent-reopen]').waitFor()
      expect(await page.locator('[data-consent-dialog]').count()).toBe(0)

      const record = await page.evaluate(
        key => JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>,
        CONSENT_KEY
      )
      expect(record.analytics).toBe(true)
      expect(record.marketing).toBe(false)

      expect(new URL(page.url()).searchParams.has(CONSENT_LINK_PARAM)).toBe(false)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('no referrer at all: the dialog still shows, and the parameter is still stripped', async () => {
    const owlcc = encodeConsentLink({ essential: true, analytics: true, marketing: true })
    const { page, close } = await mountComponent({
      url: `${base}/?linker=1&owlcc=${owlcc}`, waitUntil: 'domcontentloaded',
    })
    try {
      await page.locator('[data-consent-dialog]').waitFor()
      expect(new URL(page.url()).searchParams.has(CONSENT_LINK_PARAM)).toBe(false)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a foreign (unlisted) referrer: refused, dialog shows', async () => {
    const owlcc = encodeConsentLink({ essential: true, analytics: true, marketing: true })
    const { page, close } = await mountComponent({ url: `${base}/`, waitUntil: 'commit' })
    try {
      await page.goto(`${base}/?linker=1&owlcc=${owlcc}`, {
        waitUntil: 'domcontentloaded', referer: 'https://evil.test/',
      })
      await page.locator('[data-consent-dialog]').waitFor()
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a stale value past maxAge: refused, dialog shows', async () => {
    const stale = Buffer.from(JSON.stringify({
      v: 2, c: { analytics: 1, marketing: 1 }, t: nowSeconds() - CONSENT_LINK_MAX_AGE - 60,
    })).toString('base64url')
    const { page, close } = await mountComponent({ url: `${base}/`, waitUntil: 'commit' })
    try {
      await page.goto(`${base}/?linker=1&owlcc=${stale}`, {
        waitUntil: 'domcontentloaded', referer: `${PARTNER_ORIGIN}/`,
      })
      await page.locator('[data-consent-dialog]').waitFor()
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a stored decision is never overwritten by an incoming link', async () => {
    const { page, close } = await mountComponent({ url: `${base}/`, waitUntil: 'commit' })
    try {
      await page.evaluate(
        ([key, value]) => window.localStorage.setItem(key as string, value as string),
        [CONSENT_KEY, JSON.stringify({ essential: true, analytics: false, marketing: false, v: 2 })]
      )
      const owlcc = encodeConsentLink({ essential: true, analytics: true, marketing: true })
      await page.goto(`${base}/?linker=1&owlcc=${owlcc}`, {
        waitUntil: 'domcontentloaded', referer: `${PARTNER_ORIGIN}/`,
      })
      await page.locator('[data-consent-reopen]').waitFor()

      const record = await page.evaluate(
        key => JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>,
        CONSENT_KEY
      )
      expect(record.analytics).toBe(false)
      expect(record.marketing).toBe(false)
    } finally {
      await close()
    }
  }, TIMEOUT)
})

/**
 * Arm every anchor to swallow its own default navigation, harmlessly — `partner.test`/
 * `elsewhere.test` are not reachable from this sandbox, and a real follow would hang the test.
 * `consentLinker`'s own listener runs in the CAPTURE phase (document, before the target is
 * reached); a plain (bubble-phase) listener added directly on each anchor fires at the "target"
 * stage, strictly AFTER capture has already finished rewriting `href` — so decoration is never
 * raced by this, only the browser's own default action is ever stopped.
 */
const armAnchors = (page: Page) => page.evaluate(() => {
  document.querySelectorAll('a').forEach(a => a.addEventListener('click', e => e.preventDefault()))
})

describe('@owlmeans/web-consent — the linker: decoration', () => {
  test('a listed partner anchor gets a fresh owlcc parameter once a decision exists', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?linker=1&anchors=1` })
    try {
      const dialog = page.locator('[data-consent-dialog]')
      await dialog.waitFor()
      await page.locator('[data-consent-accept-all]').click()
      await dialog.waitFor({ state: 'detached' })
      await armAnchors(page)

      await page.locator('#partner-link').click()
      const href = await page.locator('#partner-link').getAttribute('href')
      expect(href).toContain(`${CONSENT_LINK_PARAM}=`)
      expect(new URL(href!).hostname).toBe('partner.test')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('an unlisted host is never decorated', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?linker=1&anchors=1` })
    try {
      const dialog = page.locator('[data-consent-dialog]')
      await dialog.waitFor()
      await page.locator('[data-consent-accept-all]').click()
      await dialog.waitFor({ state: 'detached' })
      await armAnchors(page)

      await page.locator('#foreign-link').click()
      expect(await page.locator('#foreign-link').getAttribute('href')).toBe('https://elsewhere.test/')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a noreferrer anchor is never decorated, even to a listed partner', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?linker=1&anchors=1` })
    try {
      const dialog = page.locator('[data-consent-dialog]')
      await dialog.waitFor()
      await page.locator('[data-consent-accept-all]').click()
      await dialog.waitFor({ state: 'detached' })
      await armAnchors(page)

      await page.locator('#noreferrer-link').click()
      expect(await page.locator('#noreferrer-link').getAttribute('href')).toBe('https://partner.test/legal/terms')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('nothing is decorated before any decision exists', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?linker=1&anchors=1` })
    try {
      await page.locator('[data-consent-dialog]').waitFor()
      await armAnchors(page)
      // The dialog is still open (no decision yet) — click straight through to the anchor underneath.
      await page.locator('#partner-link').click({ force: true })
      expect(await page.locator('#partner-link').getAttribute('href')).toBe('https://partner.test/legal/cookies')
    } finally {
      await close()
    }
  }, TIMEOUT)
})
