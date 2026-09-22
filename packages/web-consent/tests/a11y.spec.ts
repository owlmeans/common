import { afterAll, describe, expect, test } from 'bun:test'
import { createRequire } from 'node:module'
import type { Page } from 'playwright'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import { CONSENT_KEY, CONSENT_SCHEMA_VERSION } from '@owlmeans/consent'
import { HARNESS_URL } from './context.js'

const TIMEOUT = 60_000

afterAll(async () => {
  await closeBrowser()
})

const base = HARNESS_URL.replace(/\/$/, '')
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js')

interface Violation { id: string, impact: string | null, help: string, targets: string[] }

/**
 * Every serious or critical axe violation on the page as it stands.
 *
 * Run against the THEMED harness (`styled=1`), because the rule that matters most after naming —
 * colour contrast — means nothing on an unstyled page, where every text is black on white.
 */
const serious = async (page: Page): Promise<Violation[]> => {
  await page.addScriptTag({ path: AXE })
  const violations = await page.evaluate(async () => {
    const axe = (window as never as {
      axe: { run: (context: Document) => Promise<{ violations: {
        id: string, impact: string | null, help: string, nodes: { target: string[] }[]
      }[] }> }
    }).axe
    const result = await axe.run(document)

    return result.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map(node => node.target.join(' ')),
    }))
  })

  return violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
}

describe('@owlmeans/web-consent — accessibility', () => {
  for (const theme of ['light', 'dark']) {
    test(`the open dialog has no serious or critical axe violation (${theme})`, async () => {
      // A first visit, so the dialog is open — which is what every new visitor of a generated app
      // meets before anything else on the page.
      const { page, close } = await mountComponent({ url: `${base}/?styled=1&theme=${theme}` })
      try {
        await page.waitForSelector('[data-consent-dialog]')

        expect(await serious(page)).toEqual([])
      } finally {
        await close()
      }
    }, TIMEOUT)
  }

  test('each switch is named by its category and described by its text', async () => {
    // The label element around a switch holds only the drawn track, so its NAME has to come from
    // the category label by reference — the defect this pins was three unnamed checkboxes.
    const { page, close } = await mountComponent({ url: `${base}/?styled=1` })
    try {
      await page.waitForSelector('[data-consent-dialog]')

      const essential = page.getByRole('checkbox', { name: 'Essential Cookies' })
      expect(await essential.isDisabled()).toBe(true)
      expect(await essential.isChecked()).toBe(true)
      expect(await essential.getAttribute('aria-describedby')).toBe('cc-essential-required cc-essential-desc')

      const analytics = page.getByRole('checkbox', { name: 'Analytics Cookies' })
      expect(await analytics.isDisabled()).toBe(false)
      expect(await analytics.getAttribute('aria-describedby')).toBe('cc-analytics-desc')
      await page.getByRole('checkbox', { name: 'Marketing Cookies' }).waitFor({ state: 'attached' })
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the re-open button has no serious or critical axe violation', async () => {
    const { page, close } = await mountComponent({ url: `${base}/?styled=1`, waitUntil: 'commit' })
    try {
      await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
        CONSENT_KEY,
        JSON.stringify({ essential: true, analytics: false, marketing: false, v: CONSENT_SCHEMA_VERSION }),
      ] as [string, string])
      await page.goto(`${base}/?styled=1`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[data-consent-reopen]')

      expect(await serious(page)).toEqual([])
    } finally {
      await close()
    }
  }, TIMEOUT)

  for (const theme of ['light', 'dark']) {
    test(`the policy page with services has no serious or critical axe violation (${theme})`, async () => {
      const { page, close } = await mountComponent({ url: `${base}/?styled=1&theme=${theme}`, waitUntil: 'commit' })
      try {
        // With a decision stored, so the dialog does not cover the page being checked.
        await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
          CONSENT_KEY,
          JSON.stringify({ essential: true, analytics: true, marketing: false, v: CONSENT_SCHEMA_VERSION }),
        ] as [string, string])
        await page.goto(`${base}/?view=policy&services=1&styled=1&theme=${theme}`, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('[data-cookie-policy-service]')

        expect(await serious(page)).toEqual([])
      } finally {
        await close()
      }
    }, TIMEOUT)
  }
})
