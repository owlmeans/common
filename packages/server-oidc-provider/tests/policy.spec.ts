import { describe, it, expect, afterEach } from 'bun:test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHmac } from 'node:crypto'
import Provider, { errors, interactionPolicy } from 'oidc-provider'
import type { Configuration } from 'oidc-provider'
import { makeInteractionPolicy } from '../src/utils/policy.js'
import { ACCOUNT_REFUSED_REASON } from '../src/utils/consts.js'

const KEYS = ['policy-spec-cookie-key']
const CLIENT_ID = 'policy-spec-client'
const REDIRECT_URI = 'https://rp.example.test/callback'
const STRANGER = 'email-otp:someone-elses'
const MEMBER = 'email-otp:this-organization'

interface Running { provider: Provider, base: string }

const running: Server[] = []

afterEach(() => {
  while (running.length > 0) running.pop()?.close()
})

/** A real provider served on a loopback port, whose `findAccount` refuses `STRANGER` alone. */
const start = async (policy: Configuration['interactions']): Promise<Running> => {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  running.push(server)
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const provider = new Provider(base, {
    clients: [{
      client_id: CLIENT_ID,
      client_secret: 'policy-spec-secret',
      redirect_uris: [REDIRECT_URI],
      response_types: ['code'],
      grant_types: ['authorization_code'],
    }],
    cookies: { keys: KEYS },
    features: { devInteractions: { enabled: false } },
    findAccount: async (_, id) => id === STRANGER
      ? undefined
      : { accountId: id, claims: async () => ({ sub: id }) },
    interactions: {
      ...policy,
      url: async (_, interaction) => `${base}/login/${interaction.uid}`,
    },
  })

  server.on('request', provider.callback())

  return { provider, base }
}

/** Koa's signed-cookie signature: the first key's HMAC-SHA1, base64 with the URL-safe alphabet. */
const sign = (pair: string): string => createHmac('sha1', KEYS[0]).update(pair).digest('base64')
  .replace(/[/+=]/g, c => ({ '/': '_', '+': '-', '=': '' })[c] as string)

/** A provider session that already names `accountId`, as a browser cookie header. */
const sessionCookie = async (provider: Provider, accountId: string): Promise<string> => {
  const session = Object.assign(new provider.Session(), { accountId })
  await session.save(600)
  const pair = `_session=${session.jti}`

  return `${pair}; _session.sig=${sign(pair)}`
}

const AUTHORIZATION = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: 'openid',
})

// The provider is asked for a redirect, never followed: the interesting part is where it points.
const authorize = async ({ base }: Running, cookie: string): Promise<Response> =>
  fetch(`${base}/auth?${AUTHORIZATION}`, { redirect: 'manual', headers: { cookie } })

/** The cookies a browser would hold between requests to the provider. */
const makeJar = (initial = '') => {
  const jar = new Map<string, string>(
    initial === '' ? [] : initial.split('; ').map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)])
  )

  return {
    header: () => [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
    remember: (response: Response) => {
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(';')
        const name = pair.slice(0, pair.indexOf('='))
        const value = pair.slice(pair.indexOf('=') + 1)
        if (value === '') jar.delete(name)
        else jar.set(name, value)
      }
    },
  }
}

const locationOf = (response: Response): URL => new URL(response.headers.get('location') ?? 'about:blank')

/** The interaction a redirect to the (test) login screen points at. */
const interactionOf = (env: Running, response: Response) =>
  env.provider.Interaction.find(locationOf(response).pathname.split('/').pop() ?? '')


describe('login policy for a session whose account the application refused', () => {
  it('crashes the authorization request with the provider default policy', async () => {
    const env = await start(undefined)
    const response = await authorize(env, await sessionCookie(env.provider, STRANGER))

    // The provider's own answer to the crash: an error page, never a login. (Behind the
    // application's error rendering the relying party receives `error=server_error`.)
    expect(response.status).toBe(500)
    expect(await response.text()).toContain('server_error')
  })

  it('sends it back to the login interaction', async () => {
    const env = await start({ policy: makeInteractionPolicy() })
    const response = await authorize(env, await sessionCookie(env.provider, STRANGER))

    expect(response.status).toBe(303)
    expect(locationOf(response).href.startsWith(`${env.base}/login/`)).toBe(true)

    const interaction = await interactionOf(env, response)
    expect(interaction?.prompt.name).toBe('login')
    expect(interaction?.prompt.reasons).toContain(ACCOUNT_REFUSED_REASON)
  })

  it('still asks a visitor with no session to log in', async () => {
    const env = await start({ policy: makeInteractionPolicy() })
    const response = await authorize(env, '')

    expect(response.status).toBe(303)
    const interaction = await interactionOf(env, response)
    expect(interaction?.prompt.name).toBe('login')
    expect(interaction?.prompt.reasons).not.toContain(ACCOUNT_REFUSED_REASON)
  })
})

describe('the login that follows a refused session', () => {
  it('replaces the stale session and completes the original request', async () => {
    const env = await start({ policy: makeInteractionPolicy() })
    const jar = makeJar(await sessionCookie(env.provider, STRANGER))
    const step = async (url: string, init: RequestInit = {}): Promise<Response> => {
      const response = await fetch(url, {
        ...init, redirect: 'manual', headers: { ...init.headers, cookie: jar.header() },
      })
      jar.remember(response)

      return response
    }

    // 1. The refused session is asked to log in.
    const asked = await step(`${env.base}/auth?${AUTHORIZATION}`)
    const interaction = await interactionOf(env, asked)
    expect(interaction?.prompt.name).toBe('login')

    // 2. The login screen finishes as the application's interaction handler does.
    const grant = new env.provider.Grant({ accountId: MEMBER, clientId: CLIENT_ID })
    grant.addOIDCScope('openid')
    interaction!.result = { login: { accountId: MEMBER }, consent: { grantId: await grant.save() } }
    await interaction!.save(600)

    // 3. Resuming names an account other than the session's, so the provider signs the old one out…
    const resumed = await step(interaction!.returnTo)
    expect(resumed.status).toBe(200)
    const form = await resumed.text()
    const action = /action="([^"]+)"/.exec(form)?.[1]
    const xsrf = /name="xsrf" value="([^"]+)"/.exec(form)?.[1]
    expect(action).toContain('/session/end/confirm')
    expect(xsrf).toBeDefined()

    const signedOut = await step(action!, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ xsrf: xsrf!, logout: 'yes' }),
    })
    expect(signedOut.status).toBe(303)

    // 4. …and continues the request it interrupted, ending at the relying party with a code.
    const done = await step(signedOut.headers.get('location')!)
    expect(done.status).toBe(303)
    const callback = locationOf(done)
    expect(callback.origin + callback.pathname).toBe(REDIRECT_URI)
    expect(callback.searchParams.get('code')).not.toBeNull()
    expect(callback.searchParams.get('error')).toBeNull()
  })
})

describe('the account_refused check', () => {
  const check = makeInteractionPolicy().get('login')?.checks.get(ACCOUNT_REFUSED_REASON)
  const run = (oidc: Record<string, unknown>) => check!.check({ oidc } as never)

  it('is registered on the login prompt', () => {
    expect(check).toBeDefined()
    expect(check?.error).toBe('login_required')
  })

  it('leaves a loaded account alone', async () => {
    expect(await run({ session: { accountId: 'a' }, account: { accountId: 'a' } }))
      .toBe(interactionPolicy.Check.NO_NEED_TO_PROMPT)
  })

  it('leaves a request with no session account to the provider own check', async () => {
    expect(await run({ session: {} })).toBe(interactionPolicy.Check.NO_NEED_TO_PROMPT)
  })

  it('asks a refused session to log in', async () => {
    expect(await run({ session: { accountId: 'a' } })).toBe(interactionPolicy.Check.REQUEST_PROMPT)
  })

  it('denies, not loops, when the login that just completed is refused too', () => {
    expect(() => run({ session: { accountId: 'a' }, result: { login: { accountId: 'a' } } }))
      .toThrow(errors.AccessDenied)
  })
})
