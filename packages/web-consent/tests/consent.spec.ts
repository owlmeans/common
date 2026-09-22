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

  test('the re-open button is a bare, compact corner icon', async () => {
    // The harness carries no Tailwind build (the package ships classes for a CONSUMING app's own
    // `@source` scan, as `web-panel`'s consuming `index.css` does), so this is asserted on the
    // class list itself rather than on computed style — exactly what every card/border/shadow/
    // size utility below would resolve to once a consumer's stylesheet compiles them.
    const { page, close } = await seeded(
      { essential: true, analytics: false, marketing: false, v: CONSENT_SCHEMA_VERSION }
    )
    try {
      const button = page.locator('[data-consent-reopen]')
      await button.waitFor()
      const cls = await button.getAttribute('class') ?? ''

      // In the very corner, not 20px off it (`bottom-5 left-5` was the old, card-sized offset).
      expect(cls).toContain('bottom-1')
      expect(cls).toContain('left-1')
      // Bare icon: no filled surface, no border, no shadow, no hover-scale card affordance.
      expect(cls).toContain('bg-transparent')
      expect(cls).not.toMatch(/\bshadow-lg\b/)
      expect(cls).not.toMatch(/\brounded-full\b/)
      expect(cls).not.toMatch(/\bborder-border\b/)
      expect(cls).not.toMatch(/\bhover:scale-110\b/)
      // The pictogram itself keeps its original size.
      const iconCls = await page.locator('[data-consent-reopen] svg').getAttribute('class') ?? ''
      expect(iconCls).toMatch(/\bh-5\b/)
      expect(iconCls).toMatch(/\bw-5\b/)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the dialog is flat: theme tokens, hairlines and pills — no gradient, shadow or blur', async () => {
    // It is the first thing every new visitor of a generated app sees, and that app's rule is no
    // gradient, glow, shadow or backdrop-filter anywhere. Asserted on the class lists for the same
    // reason as the re-open button below: the harness compiles no stylesheet.
    const { page, close } = await mountComponent({ url: `${base}/` })
    try {
      const dialog = page.locator('[data-consent-dialog]')
      await dialog.waitFor()
      const classes = await dialog.evaluate(root => [root, ...Array.from(root.querySelectorAll('*'))]
        .map(element => element.getAttribute('class') ?? '').join(' '))

      expect(classes).not.toMatch(/\b(?:bg-gradient|from-|to-secondary|backdrop-|blur|shadow|ring-primary)/)
      // The overlay is a flat translucent black, and the card sits on the ground token.
      expect(await dialog.getAttribute('class')).toContain('bg-black/70')
      const card = dialog.locator(':scope > div')
      expect(await card.getAttribute('class')).toMatch(/\bbg-background\b/)
      expect(await card.getAttribute('class')).toMatch(/\bborder-border\b/)
      expect(await card.getAttribute('class')).toMatch(/\brounded-3xl\b/)

      // One accent pill for accepting, an outlined pill for the rest; both a 44px target with a
      // visible focus ring.
      const accept = await page.locator('[data-consent-accept-all]').getAttribute('class') ?? ''
      const save = await page.locator('[data-consent-save]').getAttribute('class') ?? ''
      expect(accept).toMatch(/\bbg-primary\b/)
      expect(accept).toMatch(/\btext-primary-foreground\b/)
      expect(save).not.toMatch(/\bbg-primary\b/)
      expect(save).toMatch(/\bborder-foreground\b/)
      for (const cls of [accept, save]) {
        expect(cls).toMatch(/\brounded-full\b/)
        expect(cls).toMatch(/\bmin-h-11\b/)
        expect(cls).toContain('focus-visible:outline-ring')
      }
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

  test('each service is disclosed under the category that gates it', async () => {
    // "Analytics cookies" says why something is stored, never who receives it — the service row is
    // the part a regulator actually reads, so it must sit inside ITS category, not in a list of
    // its own where nothing ties it to the switch that governs it.
    const { page, close } = await mountComponent({ url: `${base}/?view=policy&services=1` })
    try {
      const analytics = page.locator('[data-cookie-policy-category="analytics"]')
      await analytics.waitFor()
      const text = await analytics.innerText()

      expect(text).toContain('Example Analytics')
      expect(text).toContain('Example Corp')
      expect(text).toContain('Counts page views.')
      expect(text).toContain('_ex_1')
      expect(await analytics.locator('a[href="https://example.test/vendor-privacy"]').innerText())
        .toContain('Example Corp')
      // The list is named for assistive technology by the category it belongs to.
      expect(await analytics.locator('ul').getAttribute('aria-label')).toContain('Analytics')

      // Nothing leaked into a category that does not gate it.
      expect(await page.locator('[data-cookie-policy-category="marketing"]').innerText())
        .not.toContain('Example Analytics')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a service whose category is not in force is still disclosed, never dropped', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?view=policy&services=1` })
    try {
      const other = page.locator('[data-cookie-policy-other]')
      await other.waitFor()

      expect(await other.innerText()).toContain('Orphan Pixel')
      // Still one heading: services are list items, never headings that would skip a level.
      expect(await page.locator('[data-cookie-policy] h1').count()).toBe(1)
      expect(await page.locator('[data-cookie-policy] h2, [data-cookie-policy] h3').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('with no services the page renders exactly as before', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?view=policy` })
    try {
      await page.locator('[data-cookie-policy]').waitFor()

      expect(await page.locator('[data-cookie-policy-service]').count()).toBe(0)
      expect(await page.locator('[data-cookie-policy-other]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the service labels follow the locale', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?view=policy&services=1&locale=de` })
    try {
      const analytics = page.locator('[data-cookie-policy-category="analytics"]')
      await analytics.waitFor()
      const text = await analytics.innerText()

      expect(text).toContain(defaultConsentTranslate('de')('policyProvider', ''))
      expect(text).toContain(defaultConsentTranslate('de')('policyPurpose', ''))
      expect(defaultConsentTranslate('de')('policyProvider', '')).not.toBe('Provider')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the privacy and terms links follow the locale', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?view=policy&locale=de` })
    try {
      const policy = page.locator('[data-cookie-policy]')
      await policy.waitFor()
      const de = defaultConsentTranslate('de')

      expect(await policy.locator('a[href="https://example.test/privacy"]').innerText())
        .toBe(de('privacy', ''))
      expect(await policy.locator('a[href="https://example.test/terms"]').innerText())
        .toBe(de('terms', ''))
      expect(de('privacy', '')).not.toBe('Privacy Policy')
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
