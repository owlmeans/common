import type { Page } from '@owlmeans/test-ui'
import { browserHelper } from '@owlmeans/test-ui'
import {
  BotActionKind, BotConnectionStatus, BotMatchMode, BotPlatform, BotReceiveMode, BotRuleAction, BotTransport,
  type BotActivity, type BotConnection, type BotRule,
} from '@owlmeans/bot'
import { HARNESS_URL } from './context.js'

/** Generous: a cold harness compiles the whole app on its first request. */
export const TIMEOUT = 60_000

/** One request the page made to the bot API. */
export interface Call {
  method: string
  /** The path after `/bot/operator/` — `connections`, `connections/c1/verify`, `rules` … */
  path: string
  query: Record<string, string>
  body: any
}

/** What the server answers a call with. */
export type Answer =
  | { status?: number, json: unknown }
  | { status: number, error: string }

/** Answer a call — return undefined for a 500 the spec did not expect. */
export type Server = (call: Call, calls: Call[]) => Answer | undefined

/** The wire shape of a refused request: `type|||message|||stack`, exactly what the API client unmarshals. */
export const refusal = (type: string, message: string, status: number): Answer =>
  ({ status, error: `${type}|||${message}|||at server` })

export const connectionOf = (over: Partial<BotConnection> = {}): BotConnection => ({
  id: 'c1', scope: 'org', platform: BotPlatform.Telegram, label: 'Moderator', transport: BotTransport.Live,
  status: BotConnectionStatus.Pending, enabled: true, receive: BotReceiveMode.Webhook, credentialsSet: ['token'],
  createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
  ...over,
})

export const ruleOf = (over: Partial<BotRule> = {}): BotRule => ({
  id: 'r1', scope: 'org', connection: null, name: 'Spam', keywords: ['free money'], mode: BotMatchMode.Word,
  action: BotRuleAction.Delete, enabled: true, order: 1,
  createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
  ...over,
})

export const activityOf = (over: Partial<BotActivity> = {}): BotActivity => ({
  id: 'a1', scope: 'org', connection: 'c1', platform: BotPlatform.Telegram, update: 'u1',
  action: BotActionKind.Delete, target: { chat: '-100', message: '42', user: '7' }, text: 'free money here',
  rule: 'r1', ok: true, transport: BotTransport.Mock, at: '2026-10-01T10:00:00.000Z',
  ...over,
})

export interface Opened {
  page: Page
  calls: Call[]
  close: () => Promise<void>
}

/**
 * Open the harness with `query` (its switches) and the bot API answered by `server`. The answers
 * sit on this origin (the harness declares the API service on it), so there is no CORS to satisfy
 * and no live server to reach.
 */
export const open = async (query: Record<string, string>, server: Server): Promise<Opened> => {
  const browser = await browserHelper.launchBrowser({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)

  const calls: Call[] = []
  await context.route(/\/api\/bot\/operator\//, async route => {
    const request = route.request()
    const url = new URL(request.url())
    const raw = request.postData()
    const call: Call = {
      method: request.method(),
      path: url.pathname.split('/bot/operator/')[1] ?? '',
      query: Object.fromEntries(url.searchParams.entries()),
      body: raw != null && raw !== '' ? JSON.parse(raw) : undefined,
    }
    calls.push(call)
    const answer = server(call, calls)
    if (answer == null) return await route.fulfill({ status: 500, body: `no answer for ${call.method} ${call.path}` })

    return 'error' in answer
      ? await route.fulfill({ status: answer.status, contentType: 'text/plain', body: answer.error })
      : await route.fulfill({
        status: answer.status ?? 200, contentType: 'application/json', body: JSON.stringify(answer.json),
      })
  })

  const url = new URL(`${HARNESS_URL}/`)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' })
  await page.locator('[data-harness-ready]').waitFor({ state: 'attached', timeout: 45_000 })

  return { page, calls, close: async () => { await context.close() } }
}

/** The `data-bot-field` keys of the credential inputs on screen, in order. */
export const fieldsOn = async (page: Page): Promise<string[]> =>
  await page.locator('[data-bot-field]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-bot-field') ?? ''))

/** Choose `option` in the Radix select carrying `data-bot-input="<input>"`. */
export const choose = async (page: Page, input: string, option: string): Promise<void> => {
  await page.locator(`[data-bot-input="${input}"]`).click()
  await page.locator(`[role="option"][data-bot-option="${option}"]`).click()
  await page.locator('[role="listbox"]').waitFor({ state: 'detached' })
}

/** Wait until `predicate` holds over the recorded calls. */
export const untilCall = async (calls: Call[], predicate: (call: Call) => boolean, timeout = 15_000): Promise<Call> => {
  const deadline = Date.now() + timeout
  for (;;) {
    const found = calls.find(predicate)
    if (found != null) return found
    if (Date.now() > deadline) throw new Error(`no matching call among ${calls.map(call => `${call.method} ${call.path}`).join(', ')}`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}
