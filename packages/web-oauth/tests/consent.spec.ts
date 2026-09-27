import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser } from '@owlmeans/test-ui'
import { OAUTH_CONSENT_PATH, oauth } from '@owlmeans/oauth'
import { OAUTH_SUSPEND_TTL_MS } from '../src/consts.js'
import en from '../src/i18n/en.json' with { type: 'json' }
import { bearer, codeView, deviceView, open, refusal, TIMEOUT } from './helpers.js'
import { HARNESS_URL } from './context.js'

afterAll(async () => { await closeBrowser() })

const CONSENT = `${OAUTH_CONSENT_PATH}?ref=ABCD-EFGH`

describe('consent screen — signed out', () => {
  test('shows no approve button, suspends the consent flow and leaves for the dispatcher', async () => {
    const before = Date.now()
    const { page, calls, close } = await open(CONSENT)
    try {
      await page.waitForURL(url => url.pathname === '/dispatcher', { timeout: 45_000 })

      // Nobody is signed in, so there is nothing to load and nothing to approve.
      expect(calls).toEqual([])
      expect(await page.getByTestId('oauth-consent-approve').count()).toBe(0)

      // The real dispatcher chooser is what the person lands on.
      await page.locator('[data-login-screen], [data-login-method]').first().waitFor({ state: 'attached' })

      // The suspension is a real record in the real flow store: destination, payload, an expiry.
      const record = await page.evaluate(async () => await (window as any).__oauth.suspended()) as
        { id: string, entrypoint: string, query: Record<string, string>, expiresAt: number } | null
      expect(record).not.toBeNull()
      expect(record!.entrypoint).toBe(oauth.consentScreen)
      expect(record!.query.ref).toBe('ABCD-EFGH')
      expect(record!.expiresAt).toBeGreaterThan(before + OAUTH_SUSPEND_TTL_MS - 5_000)
      expect(record!.expiresAt).toBeLessThan(Date.now() + OAUTH_SUSPEND_TTL_MS + 5_000)
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('consent screen — the round trip through sign-in', () => {
  test('after signing in at the dispatcher the person is back on the SAME request, ready to approve', async () => {
    const { page, calls, close } = await open(CONSENT, {
      authenticate: true, stubs: { load: { json: deviceView() }, approve: { json: {} } },
    })
    try {
      await page.waitForURL(url => url.pathname === '/dispatcher', { timeout: 45_000 })
      expect(await page.evaluate(async () => await (window as any).__oauth.suspended())).not.toBeNull()

      // Any sign-in method ends the same way: the dispatcher is handed a token.
      await page.goto(`${HARNESS_URL}/dispatcher?token=signed-in-elsewhere`, { waitUntil: 'domcontentloaded' })

      await page.getByTestId('oauth-consent-approve').waitFor({ state: 'visible', timeout: 45_000 })
      const url = new URL(page.url())
      expect(url.pathname).toBe(OAUTH_CONSENT_PATH)
      expect(url.searchParams.get('ref')).toBe('ABCD-EFGH')
      expect(calls).toContain('POST authenticate')
      expect(calls).toContain('GET ABCD-EFGH')
      // The suspension answered exactly one sign-in.
      expect(await page.evaluate(async () => await (window as any).__oauth.suspended())).toBeNull()
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('consent screen — signed in', () => {
  test('a device request shows who asks, the code and the device, and approving ends on Done', async () => {
    const { page, calls, close } = await open(CONSENT, {
      signedIn: true, stubs: { load: { json: deviceView() }, approve: { json: {} } },
    })
    try {
      await page.getByTestId('oauth-consent-approve').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await page.getByTestId('oauth-consent-client').textContent()).toContain('Viable MCP')
      expect(await page.getByTestId('oauth-consent-code').textContent()).toContain('ABCD-EFGH')
      expect(await page.getByText('my-laptop').count()).toBe(1)
      expect(await page.getByRole('alert').count()).toBe(0)
      expect(calls).toEqual(['GET ABCD-EFGH'])

      await page.getByTestId('oauth-consent-approve').click()
      await page.waitForURL(url => url.pathname === '/oauth/done', { timeout: 30_000 })

      expect(calls).toEqual(['GET ABCD-EFGH', 'POST ABCD-EFGH/approve'])
      expect(new URL(page.url()).searchParams.get('kind')).toBe('device')
      expect(await page.getByTestId('oauth-done-card').textContent()).toContain(en.done['device-message'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a code request names the redirect host and warns when every redirect is on this computer', async () => {
    const { page, close } = await open(`${OAUTH_CONSENT_PATH}?ref=req-1`, {
      signedIn: true, stubs: { load: { json: codeView() } },
    })
    try {
      await page.getByTestId('oauth-consent-approve').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await page.getByTestId('oauth-consent-client').textContent()).toContain('Claude Code')
      expect(await page.getByText('claude.ai').count()).toBeGreaterThan(0)
      expect(await page.getByText('127.0.0.1').count()).toBeGreaterThan(0)
      expect(await page.getByRole('alert').textContent()).toContain('only registered addresses on your own computer')
      // A code grant has no user code and no device.
      expect(await page.getByTestId('oauth-consent-code').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a request from a client with no localhost-only concern carries no warning', async () => {
    const { page, close } = await open(`${OAUTH_CONSENT_PATH}?ref=req-1`, {
      signedIn: true, stubs: { load: { json: codeView({ localhostOnly: false, redirectHost: 'app.example.com' }) } },
    })
    try {
      await page.getByTestId('oauth-consent-approve').waitFor({ state: 'visible', timeout: 45_000 })
      expect(await page.getByRole('alert').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('approving a code request sends the browser to the redirect the server returned', async () => {
    const target = `${HARNESS_URL}/client-callback?code=one-time&state=s1&iss=https%3A%2F%2Fapi.example.test`
    const { page, calls, close } = await open(`${OAUTH_CONSENT_PATH}?ref=req-1`, {
      signedIn: true, stubs: { load: { json: codeView() }, approve: { json: { redirect: target } } },
    })
    try {
      await page.getByTestId('oauth-consent-approve').waitFor({ state: 'visible', timeout: 45_000 })
      await page.getByTestId('oauth-consent-approve').click()
      await page.waitForURL(url => url.pathname === '/client-callback', { timeout: 30_000 })

      expect(page.url()).toBe(target)
      expect(calls).toEqual(['GET req-1', 'POST req-1/approve'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('denying is symmetric: a code request follows the redirect, a device request ends on Done', async () => {
    const back = `${HARNESS_URL}/client-callback?error=access_denied&state=s1`
    const code = await open(`${OAUTH_CONSENT_PATH}?ref=req-1`, {
      signedIn: true, stubs: { load: { json: codeView() }, deny: { json: { redirect: back } } },
    })
    try {
      await code.page.getByTestId('oauth-consent-deny').waitFor({ state: 'visible', timeout: 45_000 })
      await code.page.getByTestId('oauth-consent-deny').click()
      await code.page.waitForURL(url => url.pathname === '/client-callback', { timeout: 30_000 })

      expect(code.page.url()).toBe(back)
      expect(code.calls).toEqual(['GET req-1', 'POST req-1/deny'])
    } finally {
      await code.close()
    }

    const device = await open(CONSENT, {
      signedIn: true, stubs: { load: { json: deviceView() }, deny: { json: {} } },
    })
    try {
      await device.page.getByTestId('oauth-consent-deny').waitFor({ state: 'visible', timeout: 45_000 })
      await device.page.getByTestId('oauth-consent-deny').click()
      await device.page.waitForURL(url => url.pathname === '/oauth/done', { timeout: 30_000 })

      expect(device.calls).toEqual(['GET ABCD-EFGH', 'POST ABCD-EFGH/deny'])
      expect(await device.page.getByTestId('oauth-done-card').count()).toBe(1)
    } finally {
      await device.close()
    }
  }, TIMEOUT)

  test('"Use another account" signs the session out and goes through the same suspension', async () => {
    const { page, close } = await open(CONSENT, {
      signedIn: true, stubs: { load: { json: deviceView() } },
    })
    try {
      await page.getByTestId('oauth-consent-switch').waitFor({ state: 'visible', timeout: 45_000 })
      expect(await page.evaluate(async () => await (window as any).__oauth.token())).not.toBeNull()

      await page.getByTestId('oauth-consent-switch').click()
      await page.waitForURL(url => url.pathname === '/dispatcher', { timeout: 45_000 })

      expect(await page.evaluate(async () => await (window as any).__oauth.token())).toBeNull()
      const record = await page.evaluate(async () => await (window as any).__oauth.suspended()) as
        { entrypoint: string, query: Record<string, string> } | null
      expect(record?.entrypoint).toBe(oauth.consentScreen)
      expect(record?.query.ref).toBe('ABCD-EFGH')
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('consent screen — when it cannot go on', () => {
  const cases = [
    ['an expired request', refusal('OAuthRequestExpired', 'oauth:request-expired:ABCD-EFGH'), 'error-expired'],
    ['an unknown or already used request', refusal('OAuthRequestNotFound', 'oauth:request-not-found:ABCD-EFGH'), 'error-not-found'],
    ['an end-user identity refused with 403', refusal('AuthForbidden', 'auth:forbidden:profile'), 'error-forbidden'],
  ] as const

  for (const [name, answer, key] of cases) {
    test(`${name} is one plain sentence and offers nothing to approve`, async () => {
      const { page, close } = await open(CONSENT, { signedIn: true, stubs: { load: answer } })
      try {
        await page.getByTestId('oauth-consent-error').waitFor({ state: 'visible', timeout: 45_000 })

        const said = (await page.getByTestId('oauth-consent-error').textContent()) ?? ''
        expect(said).toBe(en.consent[key])
        // Not the wire text, and not a stack.
        expect(said).not.toMatch(/oauth:|auth:|\|\|\||at server/)
        expect(await page.getByTestId('oauth-consent-approve').count()).toBe(0)
        expect(await page.getByTestId('oauth-consent-deny').count()).toBe(0)
      } finally {
        await close()
      }
    }, TIMEOUT)
  }

  test('a link with no request in it says there is nothing to approve', async () => {
    const { page, calls, close } = await open(OAUTH_CONSENT_PATH, { signedIn: true })
    try {
      await page.getByTestId('oauth-consent-error').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await page.getByTestId('oauth-consent-error').textContent()).toBe(en.consent['error-missing'])
      expect(calls).toEqual([])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a server failure that is none of those says only that something went wrong', async () => {
    const { page, close } = await open(CONSENT, {
      signedIn: true, stubs: { load: { status: 500, error: 'boom' } },
    })
    try {
      await page.getByTestId('oauth-consent-error').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await page.getByTestId('oauth-consent-error').textContent()).toBe(en.consent.error)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('refuses to render inside a frame, so an approval cannot be a clickjacked click', async () => {
    // The FRAMED app is the one that has to be signed in, so the bearer rides in its own address.
    const src = encodeURIComponent(`${CONSENT}&bearer=${encodeURIComponent(await bearer())}`)
    const { page, calls, close } = await open(`/frame.html?src=${src}`, {
      stubs: { load: { json: deviceView() }, approve: { json: {} } },
    })
    try {
      const frame = page.frameLocator('#frame')
      await frame.getByTestId('oauth-consent-card').waitFor({ state: 'visible', timeout: 45_000 })

      expect(await frame.getByRole('alert').textContent()).toBe(en.consent.framed)
      expect(await frame.getByTestId('oauth-consent-approve').count()).toBe(0)
      expect(await frame.getByTestId('oauth-consent-deny').count()).toBe(0)
      expect(calls.some(call => call.startsWith('POST'))).toBe(false)
    } finally {
      await close()
    }
  }, TIMEOUT)
})
