import { launchBrowser } from '@owlmeans/test-ui'
import type { Page } from '@owlmeans/test-ui'
import { makeBearer, USER } from '@owlmeans/test-auth'
import { STANDARD_MARKETING_CONSENTS } from '@owlmeans/marketing-consent'
import type { MarketingConsentStatusItem, MarketingConsentStatusView } from '@owlmeans/marketing-consent'
import { HARNESS_URL } from './context.js'

/** Generous: a cold harness compiles the whole app on its first request. */
export const TIMEOUT = 60_000

/** A real, parseable bearer — the harness `?bearer=` puts it through the real auth service. */
export const bearer = async (): Promise<string> => await makeBearer(USER)

/** Every standard consent, `new`/not-granted (every standard key is `opt-in`, so this is also
 * "nothing checked by default") — with per-key overrides for the cases that need one, and an
 * optional `terms` (the server's recorded acceptance, read by the Terms-mode step/screen as
 * `status.terms?.version`). */
export const statusView = (
  overrides: Record<string, Partial<MarketingConsentStatusItem>> = {},
  opts: { terms?: { version: string, acceptedAt?: string } } = {},
): MarketingConsentStatusView => {
  const items = STANDARD_MARKETING_CONSENTS.map(definition => ({
    definition, status: 'new' as const, granted: false, updated: false,
    ...(overrides[definition.key] ?? {}),
  }))

  return {
    pending: items.some(item => item.status !== 'current'),
    items,
    ...(opts.terms != null ? { terms: { acceptedAt: '', ...opts.terms } } : {}),
  }
}

/** A per-key override that swaps part of the item's DEFINITION — links, custom text — for the cases
 * that need a catalogue other than the standard one. Pass to `statusView` as one `overrides` entry. */
export const withDefinition = (
  key: string, patch: Partial<MarketingConsentStatusItem['definition']>,
): Partial<MarketingConsentStatusItem> => ({
  definition: { ...STANDARD_MARKETING_CONSENTS.find(definition => definition.key === key)!, ...patch },
})

/** Every standard item already answered — `status.pending` false on the ITEMS half, so on the
 * sign-in step a Terms mismatch (or its absence) is the only thing left that can make the step
 * pending, and on the settings card this is the "fully decided account" case: every item still
 * loads there regardless. Pass to `statusView` as `overrides`. */
export const allItemsCurrent = (): Record<string, Partial<MarketingConsentStatusItem>> =>
  Object.fromEntries(
    STANDARD_MARKETING_CONSENTS.map(definition => [definition.key, { status: 'current' as const }])
  )

export type Answer =
  | { status?: number, json: unknown }
  | { status: number, error: string }

export interface Stubs {
  status?: Answer
  save?: Answer
  terms?: Answer
}

export interface Opened {
  page: Page
  /** Every marketing-consent API request the page made, in order — "GET status", "POST save", … */
  calls: string[]
  /** The most recent POST /save request body, parsed. */
  lastSaveBody: () => { decisions: Array<{ key: string, granted: boolean }>, source: string } | null
  /** The most recent POST /terms request body, parsed. */
  lastTermsBody: () => { documents: unknown[], notices?: unknown[], version: string, locale?: string } | null
  close: () => Promise<void>
}

/**
 * Open a screen of the harness app in a fresh browser context, with the marketing-consent API
 * answered by `stubs`. The stubs sit on this origin (the harness declares the API service on it),
 * so there is no CORS to satisfy and no live server to reach.
 */
export const open = async (
  path: string,
  opts: { stubs?: Stubs, signedIn?: boolean, lng?: string, termsMode?: boolean } = {},
): Promise<Opened> => {
  const browser = await launchBrowser({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)

  const calls: string[] = []
  let lastSave: { decisions: Array<{ key: string, granted: boolean }>, source: string } | null = null
  let lastTerms: { documents: unknown[], notices?: unknown[], version: string, locale?: string } | null = null

  await context.route(/\/api\/.*marketing-consent\//, async route => {
    const request = route.request()
    const tail = new URL(request.url()).pathname.split('/marketing-consent/')[1] ?? ''
    calls.push(`${request.method()} ${tail}`)

    const kind = tail === 'status' ? 'status' : tail === 'save' ? 'save' : tail === 'terms' ? 'terms' : null
    if (kind === 'save' && request.method() === 'POST') {
      try { lastSave = JSON.parse(request.postData() ?? '{}') } catch { lastSave = null }
    }
    if (kind === 'terms' && request.method() === 'POST') {
      try { lastTerms = JSON.parse(request.postData() ?? '{}') } catch { lastTerms = null }
    }

    const answer = kind != null ? opts.stubs?.[kind] : undefined
    if (answer == null) return await route.fulfill({ status: 500, body: `no stub for ${tail}` })

    return 'error' in answer
      ? await route.fulfill({ status: answer.status, contentType: 'text/plain', body: answer.error })
      : await route.fulfill({
        status: answer.status ?? 200, contentType: 'application/json', body: JSON.stringify(answer.json),
      })
  })

  const url = new URL(`${HARNESS_URL}${path}`)
  if (opts.signedIn === true) url.searchParams.set('bearer', await bearer())
  if (opts.lng != null) url.searchParams.set('lng', opts.lng)
  if (opts.termsMode === true) url.searchParams.set('terms', 'step')
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' })

  return {
    page, calls, lastSaveBody: () => lastSave, lastTermsBody: () => lastTerms,
    close: async () => { await context.close() },
  }
}
