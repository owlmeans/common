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
 * "nothing checked by default") — with per-key overrides for the cases that need one. */
export const statusView = (
  overrides: Record<string, Partial<MarketingConsentStatusItem>> = {},
): MarketingConsentStatusView => {
  const items = STANDARD_MARKETING_CONSENTS.map(definition => ({
    definition, status: 'new' as const, granted: false, updated: false,
    ...(overrides[definition.key] ?? {}),
  }))

  return { pending: items.some(item => item.status !== 'current'), items }
}

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
  close: () => Promise<void>
}

/**
 * Open a screen of the harness app in a fresh browser context, with the marketing-consent API
 * answered by `stubs`. The stubs sit on this origin (the harness declares the API service on it),
 * so there is no CORS to satisfy and no live server to reach.
 */
export const open = async (
  path: string, opts: { stubs?: Stubs, signedIn?: boolean, lng?: string } = {}
): Promise<Opened> => {
  const browser = await launchBrowser({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)

  const calls: string[] = []
  let lastSave: { decisions: Array<{ key: string, granted: boolean }>, source: string } | null = null

  await context.route(/\/api\/.*marketing-consent\//, async route => {
    const request = route.request()
    const tail = new URL(request.url()).pathname.split('/marketing-consent/')[1] ?? ''
    calls.push(`${request.method()} ${tail}`)

    const kind = tail === 'status' ? 'status' : tail === 'save' ? 'save' : tail === 'terms' ? 'terms' : null
    if (kind === 'save' && request.method() === 'POST') {
      try { lastSave = JSON.parse(request.postData() ?? '{}') } catch { lastSave = null }
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
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' })

  return { page, calls, lastSaveBody: () => lastSave, close: async () => { await context.close() } }
}
