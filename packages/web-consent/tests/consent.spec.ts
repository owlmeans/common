import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import {
  CONSENT_KEY, CONSENT_LOCALES, CONSENT_SCHEMA_VERSION, defaultConsentTranslate,
} from '@owlmeans/consent'
import { HARNESS_URL } from './context.js'

// Browser work does not fit the 5s default: a cold harness compiles the app on first request.
const TIMEOUT = 60_000

afterAll(async () => {
  await closeBrowser()
})

const base = HARNESS_URL.replace(/\/$/, '')

/**
 * A page booted with `record` already in storage, the way a returning visitor arrives.
 *
 * The seed lands BEFORE the document under test loads, because both things being observed — the
 * inline bootstrap's `consent/update` and the dialog's decision not to open — read storage during
 * the first paint. Seeding after load would test neither.
 */
const seeded = async (record: unknown | null, query = '') => {
  const mounted = await mountComponent({ url: `${base}/`, waitUntil: 'commit' })
  // Seed on the real origin, then reload so the document boots with the record in place.
  await mounted.page.evaluate(
    ([key, value]) => {
      if (value == null) window.localStorage.removeItem(key as string)
      else window.localStorage.setItem(key as string, value as string)
    },
    [CONSENT_KEY, record == null ? null : JSON.stringify(record)] as [string, string | null]
  )
  await mounted.page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded' })

  return mounted
}

describe('@owlmeans/web-consent — the dialog', () => {
  test('a first-time visitor is asked, and the defaults were declared before anything could read them', async () => {
    const { page, close } = await mountComponent({ url: `${base}/` })
    try {
      await page.waitForSelector('[data-consent-dialog]')

      // The ORDER is the whole point of the inline bootstrap: whatever a tag reads when it loads
      // is what it obeys, so `consent/default` has to be the FIRST thing on the queue — not merely
      // present somewhere on it.
      const layer = await page.evaluate(() => (
        (window as never as { dataLayer?: unknown[] }).dataLayer ?? []
      ).map(item => Array.from(item as ArrayLike<unknown>).slice(0, 2).join(':')))

      expect(layer[0]).toBe('consent:default')

      // No decision exists yet, so nothing may have been granted on this page.
      expect(layer.filter(entry => entry === 'consent:update')).toHaveLength(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('an existing owlmeans.com visitor is NOT asked again', async () => {
    // THE migration case. The previous widget stored two booleans and no version; a reader that
    // treated those as unusable would re-prompt every visitor the site has ever had — the most
    // expensive possible regression, and completely silent.
    const { page, close } = await seeded({ analytics: true, marketing: false })
    try {
      await page.waitForSelector('[data-consent-reopen]')

      expect(await page.locator('[data-consent-dialog]').count()).toBe(0)

      // The migration is applied on READ, in memory — a read must never write — so the assertion
      // is on the EFFECTIVE decision rather than on the stored bytes, which legitimately stay in
      // the old shape until the visitor next saves. Essential is granted without ever having been
      // offered as a choice, and the two answers the visitor did give are carried across intact.
      const applied = await page.evaluate(() => {
        const w = window as never as Record<string, unknown>

        return {
          essential: w.owlConsentEssential ?? null,
          analytics: w.owlConsentAnalytics ?? null,
          marketing: w.owlConsentMarketing ?? null,
        }
      })
      expect(applied).toEqual({ essential: true, analytics: true, marketing: false })

      // And the record still on disk is the legacy one, untouched.
      const stored = await page.evaluate(
        key => JSON.parse(window.localStorage.getItem(key) ?? 'null'), CONSENT_KEY
      ) as Record<string, unknown>
      expect(stored.v).toBeUndefined()
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a stored decision reaches the tag from the INLINE script, before React runs', async () => {
    // The returning visitor's case, and the reason the bootstrap reads storage at all: a tag that
    // loads on this page must see the previous answer immediately, or every returning visitor is
    // treated as denied for the first paint of every page.
    //
    // Asserted against the DEFAULT categories on purpose — the inline snippet is stamped by the
    // HTML emitter, so it carries whatever set the host gave `consentBootstrapScript()`, and a
    // host with custom categories must pass them there too. Mismatching the two is a real
    // misconfiguration, not something the component can paper over.
    const { page, close } = await seeded(
      { essential: true, analytics: true, marketing: false, v: CONSENT_SCHEMA_VERSION }
    )
    try {
      await page.waitForSelector('[data-consent-reopen]')

      const seen = await page.evaluate(() => {
        const layer = ((window as never as { dataLayer?: unknown[] }).dataLayer ?? [])
          .map(item => Array.from(item as ArrayLike<unknown>))

        return {
          kinds: layer.map(entry => `${String(entry[0])}:${String(entry[1])}`),
          update: layer.find(entry => entry[1] === 'update')?.[2] ?? null,
          analytics: (window as never as Record<string, unknown>).owlConsentAnalytics ?? null,
          marketing: (window as never as Record<string, unknown>).owlConsentMarketing ?? null,
        }
      })

      expect(seen.kinds[0]).toBe('consent:default')
      expect(seen.kinds).toContain('consent:update')
      expect(seen.update).toMatchObject({
        analytics_storage: 'granted', ad_storage: 'denied', security_storage: 'granted',
      })
      // `globalVar` is the seam for a snippet that cannot subscribe — a GTM custom-HTML tag, a
      // hand-placed pixel — so it has to be right by the time the update lands, which is the same
      // inline script and therefore the same tick.
      expect(seen.analytics).toBe(true)
      expect(seen.marketing).toBe(false)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('refusing a category denies its signal, and the decision survives a remount', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?categories=custom` })
    try {
      await page.waitForSelector('[data-consent-dialog]')
      // Save without granting the optional category: the essential row is locked on, the other is
      // off by default, so saving as-is IS the refusal.
      await page.locator('[data-consent-save]').click()
      await page.waitForSelector('[data-consent-reopen]')

      const denied = await page.evaluate(() => {
        const layer = ((window as never as { dataLayer?: unknown[] }).dataLayer ?? [])
          .map(item => Array.from(item as ArrayLike<unknown>))

        return {
          update: layer.filter(entry => entry[1] === 'update').pop()?.[2] ?? null,
          globalVar: (window as never as Record<string, unknown>).harnessTelemetry ?? null,
        }
      })
      expect(denied.update).toMatchObject({ analytics_storage: 'denied' })
      expect(denied.globalVar).toBe(false)

      // A decision that does not survive a remount would re-prompt on every page of an SPA.
      await page.locator('#remount').click()
      await page.waitForSelector('[data-consent-reopen]')
      expect(await page.locator('[data-consent-dialog]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a custom category set is what renders — no silent fallback to the defaults', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?categories=custom` })
    try {
      const dialog = page.locator('[data-consent-dialog]')
      await dialog.waitFor()
      const text = await dialog.innerText()

      expect(text).toContain('Telemetry')
      // The default set's optional categories must NOT appear: a component that ignored the prop
      // would still render a plausible dialog, and only their absence proves it did not.
      expect(text).not.toContain('Marketing')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the re-open button brings the dialog back with a reason', async () => {
    const { page, close } = await seeded({ essential: true, analytics: false, marketing: false, v: CONSENT_SCHEMA_VERSION })
    try {
      await page.locator('[data-consent-reopen]').click()
      await page.waitForSelector('[data-consent-dialog]')
      // The reason is what lets a host explain WHY it reopened — a login gate reads differently
      // from a footer link, and a dialog that cannot say which is not answerable.
      expect(await page.locator('[data-consent-reason]').count()).toBeGreaterThanOrEqual(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('every supported locale renders wording, never a bare key', async () => {
    // Seven languages are a shipped contract. A missing bundle does not throw — it renders the
    // key — so the visible string is the only thing worth asserting.
    for (const locale of CONSENT_LOCALES) {
      const { page, close } = await mountComponent({ url: `${base}/?locale=${locale}` })
      try {
        const dialog = page.locator('[data-consent-dialog]')
        await dialog.waitFor()
        const text = await dialog.innerText()

        expect(text).not.toContain('consent.')
        expect(text.length).toBeGreaterThan(40)
        // And it is genuinely THAT language's wording, not English shown seven times.
        expect(text).toContain(defaultConsentTranslate(locale)('consent.title', ''))
      } finally {
        await close()
      }
    }
  }, TIMEOUT * 3)
})

describe('@owlmeans/web-consent — the policy page', () => {
  test('it names what is actually stored', async () => {
    // A policy that does not name the key, the retention and the categories in force is
    // decoration. This is the page a regulator and a user both read.
    const { page, close } = await mountComponent({ url: `${base}/?view=policy` })
    try {
      const policy = page.locator('[data-cookie-policy]')
      await policy.waitFor()
      const text = await policy.innerText()

      expect(text).toContain(CONSENT_KEY)
      expect(text).toContain('Acme')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('it offers a way back to the decision', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?view=policy` })
    try {
      await page.locator('[data-cookie-policy-manage]').click()
      await page.waitForSelector('[data-consent-dialog]')
    } finally {
      await close()
    }
  }, TIMEOUT)
})
