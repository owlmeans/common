import { launchBrowser } from '@owlmeans/test-ui'
import type { Page } from '@owlmeans/test-ui'
import { makeBearer, USER } from '@owlmeans/test-auth'
import type { ConsentView } from '@owlmeans/oauth'
import { HARNESS_URL } from './context.js'

/** Generous: a cold harness compiles the whole app on its first request. */
export const TIMEOUT = 60_000

/** A real, parseable bearer — the harness `?bearer=` puts it through the real auth service. */
export const bearer = async (): Promise<string> => await makeBearer(USER)

export const deviceView = (over: Partial<ConsentView> = {}): ConsentView => ({
  ref: 'ABCD-EFGH', kind: 'device',
  client: { name: 'Viable MCP', origin: 'static' },
  userCode: 'ABCD-EFGH', deviceName: 'my-laptop',
  scopes: ['*'], expiresAt: new Date(Date.now() + 600_000).toISOString(),
  ...over,
})

export const codeView = (over: Partial<ConsentView> = {}): ConsentView => ({
  ref: 'req-1', kind: 'code',
  client: { name: 'Claude Code', origin: 'cimd', host: 'claude.ai' },
  redirectHost: '127.0.0.1', localhostOnly: true,
  scopes: ['*'], expiresAt: new Date(Date.now() + 600_000).toISOString(),
  ...over,
})

/** What the server answers a consent-API call with. */
export type Answer =
  | { status?: number, json: unknown }
  | { status: number, error: string }

export interface Stubs {
  load?: Answer
  approve?: Answer
  deny?: Answer
}

/** The wire shape of a refused request: `type|||message|||stack`, exactly what the API client unmarshals. */
export const refusal = (type: string, message: string): Answer =>
  ({ status: type === 'AuthForbidden' ? 403 : 404, error: `${type}|||${message}|||at server` })

export interface Opened {
  page: Page
  /** Every consent-API request the page made, in order — `GET`/`POST` and the path after `/oauth-consent/`. */
  calls: string[]
  close: () => Promise<void>
}

/**
 * Open a screen of the harness app in a fresh browser context, with the consent API answered by
 * `stubs`. The stubs sit on this origin (the harness declares the API service on it), so there is
 * no CORS to satisfy and no live server to reach.
 */
export const open = async (
  path: string, opts: { stubs?: Stubs, signedIn?: boolean, lng?: string, authenticate?: boolean } = {}
): Promise<Opened> => {
  const browser = await launchBrowser({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)

  const calls: string[] = []
  await context.route(/\/api\/.*oauth-consent\//, async route => {
    const request = route.request()
    const tail = new URL(request.url()).pathname.split('/oauth-consent/')[1] ?? ''
    calls.push(`${request.method()} ${tail}`)

    const kind = request.method() === 'GET' ? 'load' : tail.endsWith('/deny') ? 'deny' : 'approve'
    const answer = opts.stubs?.[kind]
    if (answer == null) return await route.fulfill({ status: 500, body: `no stub for ${kind}` })

    return 'error' in answer
      ? await route.fulfill({ status: answer.status, contentType: 'text/plain', body: answer.error })
      : await route.fulfill({
        status: answer.status ?? 200, contentType: 'application/json', body: JSON.stringify(answer.json),
      })
  })

  // The sign-in exchange the dispatcher makes when it is handed a token: answered with a bearer the
  // way the platform's own authentication endpoint does.
  if (opts.authenticate === true) {
    const issued = await bearer()
    await context.route(/\/authenticate$/, async route => {
      calls.push(`${route.request().method()} authenticate`)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: issued }) })
    })
  }

  const url = new URL(`${HARNESS_URL}${path}`)
  if (opts.signedIn === true) url.searchParams.set('bearer', await bearer())
  if (opts.lng != null) url.searchParams.set('lng', opts.lng)
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' })

  return { page, calls, close: async () => { await context.close() } }
}
