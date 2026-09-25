import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser } from '@owlmeans/test-ui'
import { MARKETING_CONSENT_SCREEN_PATH, STANDARD_MARKETING_CONSENTS } from '@owlmeans/marketing-consent'
import en from '../src/i18n/en.json' with { type: 'json' }
import { allItemsCurrent, bearer, open, statusView, TIMEOUT, withDefinition } from './helpers.js'

afterAll(async () => { await closeBrowser() })

const keys = STANDARD_MARKETING_CONSENTS.map(definition => definition.key)

describe('marketing-consent screen — signed in', () => {
  test('nothing is checked by default', async () => {
    const { page, calls, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      for (const key of keys) {
        expect(await page.locator(`[data-marketing-consent-item="${key}"]`).isChecked()).toBe(false)
      }
      expect(await page.locator('[data-marketing-consent-all]').isChecked()).toBe(false)
      expect(calls).toEqual(['GET status'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('select-all checks every item, and unchecking one shows indeterminate', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      const all = page.locator('[data-marketing-consent-all]')
      await all.waitFor({ state: 'visible', timeout: 45_000 })

      await all.click()
      for (const key of keys) {
        expect(await page.locator(`[data-marketing-consent-item="${key}"]`).isChecked()).toBe(true)
      }
      expect(await all.isChecked()).toBe(true)
      expect(await all.evaluate(node => (node as HTMLInputElement).indeterminate)).toBe(false)

      await page.locator(`[data-marketing-consent-item="${keys[0]}"]`).click()
      expect(await all.isChecked()).toBe(false)
      expect(await all.evaluate(node => (node as HTMLInputElement).indeterminate)).toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('an item flagged updated shows the "Updated" badge', async () => {
    const key = keys[0]
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true,
      stubs: { status: { json: statusView({ [key]: { status: 'revised', updated: true, granted: false } }) } },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      const badge = page.locator(`[data-marketing-consent-updated="${key}"]`)
      expect(await badge.count()).toBe(1)
      expect(await badge.textContent()).toBe(en.screen.updated)

      // Only the flagged item carries the badge.
      expect(await page.locator(`[data-marketing-consent-updated="${keys[1]}"]`).count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('save posts every current draft value, for every key, and then continues the flow', async () => {
    const { page, calls, lastSaveBody, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true,
      stubs: {
        status: { json: statusView() },
        save: { json: { ok: true, status: statusView({ [keys[0]]: { status: 'current', granted: true } }) } },
      },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      // Toggle exactly one on; the rest stay at their loaded (false) draft value.
      await page.locator(`[data-marketing-consent-item="${keys[0]}"]`).click()
      await page.locator('[data-marketing-consent-save]').click()

      await page.waitForURL(url => url.pathname === '/', { timeout: 30_000 })

      expect(calls).toEqual(['GET status', 'POST save'])
      const body = lastSaveBody()
      expect(body?.source).toBe('sign-in')
      expect(body?.decisions).toHaveLength(keys.length)
      for (const key of keys) {
        const decision = body?.decisions.find(entry => entry.key === key)
        expect(decision?.granted).toBe(key === keys[0])
      }
      expect(await page.locator('#home').count()).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a failed save shows the error and the skip link, and skip still moves the flow on', async () => {
    const { page, calls, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true,
      stubs: { status: { json: statusView() }, save: { status: 500, error: 'boom' } },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })
      await page.locator('[data-marketing-consent-save]').click()

      const error = page.locator('[data-marketing-consent-error]')
      await error.waitFor({ state: 'visible', timeout: 30_000 })
      expect(await error.textContent()).toBe(en.screen.error)

      const skip = page.locator('[data-marketing-consent-skip]')
      await skip.waitFor({ state: 'visible' })
      expect(await skip.textContent()).toBe(en.screen.skip)

      await skip.click()
      await page.waitForURL(url => url.pathname === '/', { timeout: 30_000 })
      expect(await page.locator('#home').count()).toBe(1)
      expect(calls).toEqual(['GET status', 'POST save'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the skip link is offered even without a save failure, once only optional items are shown', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      const skip = page.locator('[data-marketing-consent-skip]')
      expect(await skip.count()).toBe(1)
      expect(await page.locator('[data-marketing-consent-skip-note]').count()).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('nothing changed yet: the confirm looks muted, carries a hint, and still saves what is shown', async () => {
    const { page, calls, lastSaveBody, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() }, save: { json: { ok: true, status: statusView() } } },
    })
    try {
      const save = page.locator('[data-marketing-consent-save]')
      await save.waitFor({ state: 'visible', timeout: 45_000 })

      expect(await save.getAttribute('data-empty')).toBe('true')
      expect(await save.getAttribute('aria-disabled')).not.toBe('true')
      expect(await page.locator('[data-marketing-consent-hint]').count()).toBe(1)

      // Still genuinely clickable — a save with nothing selected is a valid, recorded decision:
      // every key posted, every one of them `granted: false`.
      await save.click()
      await page.waitForURL(url => url.pathname === '/', { timeout: 30_000 })

      expect(calls).toEqual(['GET status', 'POST save'])
      const body = lastSaveBody()
      expect(body?.decisions.every(entry => entry.granted === false)).toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('once the person changes anything, the confirm reads as an ordinary primary action', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      const save = page.locator('[data-marketing-consent-save]')
      await save.waitFor({ state: 'visible', timeout: 45_000 })
      expect(await save.getAttribute('data-empty')).toBe('true')

      await page.locator('[data-marketing-consent-all]').click()

      expect(await save.getAttribute('data-empty')).toBeNull()
      expect(await page.locator('[data-marketing-consent-hint]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a framed mount still renders — there is no framed refusal', async () => {
    const src = encodeURIComponent(
      `${MARKETING_CONSENT_SCREEN_PATH}?bearer=${encodeURIComponent(await bearer())}`
    )
    const { page, close } = await open(`/frame.html?src=${src}`, {
      stubs: { status: { json: statusView() } },
    })
    try {
      const frame = page.frameLocator('#frame')
      await frame.locator('[data-marketing-consent]').waitFor({ state: 'visible', timeout: 45_000 })
      await frame.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await frame.locator('[data-marketing-consent-error]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  /**
   * The sign-in step's own half of the `source`-dependent item-loading rule (the settings card's
   * half is `preferences.spec.ts`'s "a fully-decided account still shows every item…"): a step
   * must not re-show a catalogue that is already fully decided — unlike the settings card, it is
   * not a standing "revisit anytime" surface, so it moves the flow on instead of rendering empty.
   */
  test('everything already decided, in DEFAULT mode: shows nothing and moves straight on', async () => {
    const { page, calls, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView(allItemsCurrent()) } },
    })
    try {
      await page.waitForURL(url => url.pathname === '/', { timeout: 30_000 })
      expect(calls).toEqual(['GET status'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the privacy notice renders even in DEFAULT mode (no Terms box)', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await page.locator('[data-marketing-consent-terms]').count()).toBe(0)
      expect(await page.locator('[data-marketing-consent-privacy]').count()).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the screen is free of any cookie integration: no tracker item, no cookie note, no cookie write', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true,
      stubs: { status: { json: statusView() }, save: { json: { ok: true, status: statusView() } } },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await page.locator('[data-marketing-consent-item]').count()).toBe(keys.length)
      expect(keys.some(key => key.startsWith('trackers.'))).toBe(false)
      expect(await page.locator('[data-marketing-consent-cookie-linked]').count()).toBe(0)
      expect(await page.locator('[data-marketing-consent-from-cookies]').count()).toBe(0)

      // Saving must leave a cookie decision made elsewhere exactly as it is.
      await page.evaluate(() => {
        window.localStorage.setItem(
          'site_cookie_consent', JSON.stringify({ essential: true, analytics: true, marketing: false, v: 2 })
        )
      })
      await page.locator('[data-marketing-consent-all]').click()
      await page.locator('[data-marketing-consent-save]').click()
      await page.waitForURL(url => url.pathname === '/', { timeout: 30_000 })
      expect(await page.evaluate(() => window.localStorage.getItem('site_cookie_consent'))).toBe(
        JSON.stringify({ essential: true, analytics: true, marketing: false, v: 2 })
      )
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('Select all is the first thing in the list, framed on its own', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-all]').waitFor({ state: 'visible', timeout: 45_000 })

      const frame = page.locator('[data-marketing-consent-all-frame]')
      expect(await frame.count()).toBe(1)
      expect(await frame.locator('[data-marketing-consent-all]').count()).toBe(1)
      expect(await frame.evaluate(node => getComputedStyle(node).borderTopWidth)).not.toBe('0px')

      // Nothing precedes it among the rows, and every consent row follows it in the document.
      const before = await page.evaluate(() => {
        const all = document.querySelector('[data-marketing-consent-all-frame]')!
        return Array.from(document.querySelectorAll('[data-marketing-consent-item]'))
          .every(row => Boolean(all.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING))
      })
      expect(before).toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the Select-all checkbox stands on the same vertical line as every row\'s checkbox', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-all]').waitFor({ state: 'visible', timeout: 45_000 })

      const lefts = await page.evaluate(() => {
        const left = (node: Element | null): number => Math.round(node!.getBoundingClientRect().left)

        return {
          all: left(document.querySelector('[data-marketing-consent-all]')),
          rows: Array.from(document.querySelectorAll('[data-marketing-consent-item]')).map(left),
        }
      })

      expect(lefts.rows.length).toBeGreaterThan(1)
      for (const row of lefts.rows) expect(row).toBe(lefts.all)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the lead-in speaks of contact AND data use, and does not ask for the terms', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-all]').waitFor({ state: 'visible', timeout: 45_000 })

      const lead = page.locator('[data-marketing-consent-subtitle]')
      expect(await lead.getAttribute('data-marketing-consent-subtitle')).toBe('consents')
      expect((await lead.innerText()).trim()).toBe(en.screen.subtitle)
      expect(en.screen.subtitle).toContain('data')
      expect(en.screen.subtitle).not.toContain('terms')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the heading reads "Agreements and consents"', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-all]').waitFor({ state: 'visible', timeout: 45_000 })

      expect(en.screen.title).toBe('Agreements and consents')
      expect((await page.locator('[data-marketing-consent] h1').innerText()).trim()).toBe(en.screen.title)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the consents are one continuous list: no group heading or separator is drawn', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-all]').waitFor({ state: 'visible', timeout: 45_000 })

      // The English titles of the two groups `@owlmeans/marketing-consent`'s bundle still carries.
      const text = await page.locator('[data-marketing-consent-fields]').innerText()
      expect(text).not.toContain('Communications')
      expect(text).not.toContain('Data use')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('every consent row carries its last-updated date, from its own definition', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      for (const definition of STANDARD_MARKETING_CONSENTS) {
        const line = page.locator(`[data-marketing-consent-revised="${definition.key}"]`)
        expect(await line.count()).toBe(1)
        expect(await line.textContent()).toBe(en.screen['last-updated'].replace('{{date}}', definition.revisedAt))
      }
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a statement begins with the confirmation and never with the channel, and the link is inside the text', async () => {
    const key = keys[0]
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true,
      stubs: {
        status: {
          json: statusView({
            [key]: withDefinition(key, { links: [{ href: 'https://example.test/privacy', labelKey: 'link.privacy' }] }),
          }),
        },
      },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      const row = page.locator('label', { has: page.locator(`[data-marketing-consent-item="${key}"]`) })
      expect((await row.textContent())!.trim()).toStartWith('I confirm that I agree to receive')

      const link = row.locator('a[data-marketing-consent-link]')
      expect(await link.count()).toBe(1)
      expect(await link.getAttribute('href')).toBe('https://example.test/privacy')
      expect(await link.textContent()).toBe('Privacy Policy')
      // Inside a sentence — the words before it are the description's own.
      expect(await row.textContent()).toContain('is described in the Privacy Policy.')
      expect(await row.textContent()).not.toContain('Learn more')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a consent configured without links shows no dangling "described in the" sentence', async () => {
    const key = keys[0]
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      const row = page.locator('label', { has: page.locator(`[data-marketing-consent-item="${key}"]`) })
      expect(await row.locator('a').count()).toBe(0)
      expect(await row.textContent()).not.toContain('described in')
      expect(await row.textContent()).not.toContain('{{link}}')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a custom consent with per-language text and no keys renders that text in the interface language', async () => {
    const custom = {
      key: 'custom.training', group: 'data', mode: 'opt-in' as const, enabled: true, revisedAt: '2026-09-25',
      label: { en: 'I agree to the training use of my sessions.', pl: 'Zgadzam się na użycie moich sesji do trenowania.' },
      description: { en: 'Details are in the {{link}}.', pl: 'Szczegóły w dokumencie: {{link}}.' },
      links: [{ href: 'https://example.test/privacy', label: { en: 'Privacy Policy', pl: 'Polityka prywatności' } }],
    }
    const status = { ...statusView(), items: [{ definition: custom, status: 'new' as const, granted: false, updated: false }] }

    for (const [lng, statement, linkText] of [
      ['en', custom.label.en, 'Privacy Policy'],
      ['pl', custom.label.pl, 'Polityka prywatności'],
    ] as const) {
      const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
        signedIn: true, lng, stubs: { status: { json: status } },
      })
      try {
        const row = page.locator('label', { has: page.locator('[data-marketing-consent-item="custom.training"]') })
        await row.waitFor({ state: 'visible', timeout: 45_000 })

        expect(await row.textContent()).toContain(statement)
        expect(await row.locator('a[data-marketing-consent-link]').textContent()).toBe(linkText)
        expect(await row.textContent()).not.toContain('custom.training')
      } finally {
        await close()
      }
    }
  }, TIMEOUT)

  test('a single consent has no "all" to select', async () => {
    const custom = {
      key: 'custom.only', group: 'data', mode: 'opt-in' as const, enabled: true, revisedAt: '2026-09-25',
      label: { en: 'I agree.' },
    }
    const status = { ...statusView(), items: [{ definition: custom, status: 'new' as const, granted: false, updated: false }] }
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: status } },
    })
    try {
      await page.locator('[data-marketing-consent-item="custom.only"]').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await page.locator('[data-marketing-consent-all]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('marketing-consent screen — Terms mode (appendMarketingConsent({ terms: \'step\' }))', () => {
  test('the lead-in asks for the terms first while the Terms row is on the screen', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, termsMode: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-terms]').waitFor({ state: 'visible', timeout: 45_000 })

      const lead = page.locator('[data-marketing-consent-subtitle]')
      expect(await lead.getAttribute('data-marketing-consent-subtitle')).toBe('terms')
      expect((await lead.innerText()).trim()).toBe(en.screen['subtitle-terms'])
      expect(en.screen['subtitle-terms']).not.toBe(en.screen.subtitle)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('unticked: the confirm is blocked, no skip is offered, and the privacy notice still renders', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, termsMode: true,
      stubs: { status: { json: statusView(allItemsCurrent()) } },
    })
    try {
      const terms = page.locator('[data-marketing-consent-terms]')
      await terms.waitFor({ state: 'visible', timeout: 45_000 })
      expect(await terms.getAttribute('data-version')).toBe('harness-terms-v1')

      // No items to answer — the Terms box is the whole reason the step is pending.
      expect(await page.locator('[data-marketing-consent-item]').count()).toBe(0)
      expect(await page.locator('[data-marketing-consent-privacy]').count()).toBe(1)
      expect(await page.locator('[data-marketing-consent-skip]').count()).toBe(0)

      const save = page.locator('[data-marketing-consent-save]')
      expect(await save.getAttribute('aria-disabled')).toBe('true')
      expect(await save.getAttribute('data-blocked')).toBe('true')

      await save.click({ force: true })
      expect(await page.locator('[role="alert"]').count()).toBeGreaterThan(0)
      expect(new URL(page.url()).pathname).not.toBe('/')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('ticking it records the acceptance and continues — with pending items answered alongside it', async () => {
    const { page, calls, lastTermsBody, lastSaveBody, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, termsMode: true,
      stubs: {
        // Nothing overridden: every standard item is `new`, so both the Terms box AND the items
        // are on screen together — the ordinary case for a brand-new sign-in.
        status: { json: statusView() },
        terms: { json: { ok: true } },
        save: { json: { ok: true, status: statusView() } },
      },
    })
    try {
      await page.locator('[data-marketing-consent-terms]').waitFor({ state: 'visible', timeout: 45_000 })
      expect(await page.locator('[data-marketing-consent-item]').count()).toBeGreaterThan(0)

      await page.locator('[data-marketing-consent-terms]').check()
      await page.locator('[data-marketing-consent-save]').click()

      await page.waitForURL(url => url.pathname === '/', { timeout: 30_000 })
      expect(calls).toEqual(['GET status', 'POST terms', 'POST save'])
      expect(lastTermsBody()?.version).toBe('harness-terms-v1')
      expect(lastSaveBody()?.source).toBe('sign-in')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a version already recorded, with nothing else pending, shows nothing and moves straight on', async () => {
    const { page, calls, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, termsMode: true,
      stubs: {
        status: { json: statusView(allItemsCurrent(), { terms: { version: 'harness-terms-v1' } }) },
      },
    })
    try {
      await page.waitForURL(url => url.pathname === '/', { timeout: 30_000 })
      expect(calls).toEqual(['GET status'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a failed recording shows its own error, offers no skip, and does not continue', async () => {
    const { page, calls, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, termsMode: true,
      stubs: { status: { json: statusView(allItemsCurrent()) }, terms: { status: 500, error: 'boom' } },
    })
    try {
      await page.locator('[data-marketing-consent-terms]').waitFor({ state: 'visible', timeout: 45_000 })
      await page.locator('[data-marketing-consent-terms]').check()
      await page.locator('[data-marketing-consent-save]').click()

      const error = page.locator('[data-marketing-consent-terms-error]')
      await error.waitFor({ state: 'visible', timeout: 30_000 })
      expect(await page.locator('[data-marketing-consent-skip]').count()).toBe(0)
      expect(calls).toEqual(['GET status', 'POST terms'])
      expect(new URL(page.url()).pathname).not.toBe('/')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('Select all speaks for the Terms row too: it ticks and unticks it along with every consent', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, termsMode: true, stubs: { status: { json: statusView() } },
    })
    try {
      const all = page.locator('[data-marketing-consent-all]')
      const terms = page.locator('[data-marketing-consent-terms]')
      await all.waitFor({ state: 'visible', timeout: 45_000 })

      await all.click()
      expect(await terms.isChecked()).toBe(true)
      for (const key of keys) {
        expect(await page.locator(`[data-marketing-consent-item="${key}"]`).isChecked()).toBe(true)
      }
      expect(await all.isChecked()).toBe(true)

      // Ticking the Terms row alone is a partial selection, never "all".
      await all.click()
      expect(await terms.isChecked()).toBe(false)
      await terms.check()
      expect(await all.isChecked()).toBe(false)
      expect(await all.evaluate(node => (node as HTMLInputElement).indeterminate)).toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('Select all ahead of everything, then Terms as the first row — drawn like a consent row, marked mandatory', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, termsMode: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-terms]').waitFor({ state: 'visible', timeout: 45_000 })

      const order = await page.evaluate(() => {
        const at = (selector: string) => document.querySelector(selector)!
        const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

        return {
          allBeforeTerms: follows(at('[data-marketing-consent-all-frame]'), at('[data-marketing-consent-terms]')),
          termsBeforeItems: Array.from(document.querySelectorAll('[data-marketing-consent-item]'))
            .every(item => follows(at('[data-marketing-consent-terms]'), item)),
        }
      })
      expect(order).toEqual({ allBeforeTerms: true, termsBeforeItems: true })

      // The same row component as a consent: a plain `label`, not a bordered box of its own.
      const termsRow = page.locator('label', { has: page.locator('[data-marketing-consent-terms]') })
      const itemRow = page.locator('label', { has: page.locator(`[data-marketing-consent-item="${keys[0]}"]`) })
      expect(await termsRow.getAttribute('class')).toBe(await itemRow.getAttribute('class'))
      expect(await termsRow.evaluate(node => getComputedStyle(node.parentElement!).borderTopWidth)).toBe('0px')

      // Mandatory, and only the Terms row is.
      expect(await termsRow.locator('[data-marketing-consent-required]').count()).toBe(1)
      expect(await termsRow.locator('[data-marketing-consent-required]').textContent()).toBe('*')
      expect(await termsRow.locator('[data-marketing-consent-required]').evaluate(
        node => getComputedStyle(node).color
      )).not.toBe(await termsRow.evaluate(node => getComputedStyle(node).color))
      expect(await page.locator('[data-marketing-consent-required]').count()).toBe(1)
      expect(await page.locator('[data-marketing-consent-terms]').getAttribute('aria-required')).toBe('true')
      expect(await page.locator('[data-marketing-consent-required-note]').textContent()).toContain('Required')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the Terms row shows the date its documents were last revised', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, termsMode: true, stubs: { status: { json: statusView() } },
    })
    try {
      const revised = page.locator('[data-marketing-consent-terms-revised]')
      await revised.waitFor({ state: 'visible', timeout: 45_000 })

      expect(await revised.textContent()).toBe('Last updated: 2026-05-30')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('with no Terms row there is no asterisk and no required note', async () => {
    const { page, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, stubs: { status: { json: statusView() } },
    })
    try {
      await page.locator('[data-marketing-consent-save]').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await page.locator('[data-marketing-consent-required]').count()).toBe(0)
      expect(await page.locator('[data-marketing-consent-required-note]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('Select all does not hide the requirement: saving with only Select-all unticked stays blocked', async () => {
    const { page, calls, close } = await open(MARKETING_CONSENT_SCREEN_PATH, {
      signedIn: true, termsMode: true,
      stubs: { status: { json: statusView() }, terms: { json: { ok: true } }, save: { json: { ok: true, status: statusView() } } },
    })
    try {
      const all = page.locator('[data-marketing-consent-all]')
      await all.waitFor({ state: 'visible', timeout: 45_000 })

      // Select all, then take the Terms row back: the mandatory row now blocks the confirm.
      await all.click()
      await page.locator('[data-marketing-consent-terms]').uncheck()
      await page.locator('[data-marketing-consent-save]').click({ force: true })

      await page.locator('[role="alert"]').first().waitFor({ state: 'visible', timeout: 30_000 })
      expect(calls).toEqual(['GET status'])
      expect(new URL(page.url()).pathname).not.toBe('/')
    } finally {
      await close()
    }
  }, TIMEOUT)
})
