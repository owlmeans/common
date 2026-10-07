import { describe, expect, test } from 'bun:test'
import {
  AUTH_SCOPE, AuthenFailed, AuthenticationType, AuthRole, AuthUnavailable, GUEST_ID, MOD_RECAPTCHA, RECAPTCHA_GUARD,
} from '@owlmeans/auth'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { KeyPairModel } from '@owlmeans/basic-keys'
import { appendConfigResource, PLUGIN_RECORD, PLUGINS, PluginMissconfigured } from '@owlmeans/config'
import { createService } from '@owlmeans/context'
import type { GuardService } from '@owlmeans/entrypoint'
import { makeFixtureKeyPair } from '@owlmeans/test-auth'
import { AUTHEN_TIMEFRAME, DEFAULT_ALIAS } from '../src/consts.js'
import { makeAuthModel } from '../src/manager/model.js'
import {
  createReCaptchaVerifierService, makeReCaptchaPolicyModel, RECAPTCHA_SITEVERIFY_URL, RECAPTCHA_VERIFIER,
} from '../src/manager/plugins/export.js'
import type { ReCaptchaFetch, ReCaptchaPluginConfig, ReCaptchaRequest, ReCaptchaResponse, ReCaptchaVerifierService } from '../src/manager/plugins/export.js'
import { makeReCaptchaGuard, reCaptchaTokenOf } from '../src/index.js'
import type { AuthService } from '../src/types.js'
import { makeTestContext } from './context.js'

const POLICY: ReCaptchaPluginConfig = {
  id: MOD_RECAPTCHA, value: 'recaptcha-secret', hostnames: 'owlmeans.org, owlmeans.com', minScore: '0.5', actions: 'inquiry',
}

const GOOD: ReCaptchaResponse = {
  success: true, challenge_ts: '2026-10-06T10:00:00Z', hostname: 'vib-dev-1.owlmeans.org', score: 0.9, action: 'inquiry',
}

/**
 * The auth manager and an API server in one context: the auth service's trusted record, the auth
 * cache, the `MOD_RECAPTCHA` plugin record, a stand-in verifier that answers `answer` (no network),
 * the bearer guard and the reCAPTCHA guard.
 */
const setup = async (record: Partial<ReCaptchaPluginConfig> | null = POLICY, answer: ReCaptchaResponse = GOOD) => {
  const fixture = makeTestContext()
  const { context } = fixture
  const cfg = context.cfg as unknown as Record<string, unknown>
  cfg[PLUGIN_RECORD] = record == null ? [] : [{ ...record }]
  appendConfigResource(context as never, PLUGINS, PLUGIN_RECORD)

  const asked: ReCaptchaRequest[] = []
  const verifier = createService<ReCaptchaVerifierService>(RECAPTCHA_VERIFIER, {
    verify: async request => { asked.push(request); return answer },
  })
  context.registerService(verifier)
  context.registerService(makeReCaptchaGuard())

  context.configure()
  await context.init()

  const model = makeAuthModel(context as never)
  const guard = context.service<GuardService>(RECAPTCHA_GUARD)
  const bearer = context.service<AuthService>(DEFAULT_ALIAS)

  return { ...fixture, model, guard, bearer, asked }
}

type Setup = Awaited<ReturnType<typeof setup>>

/** A sign-in through the manager, posting whatever identity the caller likes. */
const signIn = async ({ model }: Setup, overrides: Record<string, unknown> = {}): Promise<{ token: string, challenge: string }> => {
  const { challenge } = await model.init({ type: AuthenticationType.ReCaptcha, userId: 'anyone' })
  const { token } = await model.authenticate({
    type: AuthenticationType.ReCaptcha, challenge, credential: 'google-response-token',
    userId: 'victim@example.com', role: AuthRole.Admin, scopes: ['*'],
    ...overrides,
  } as AuthCredentials)

  return { token, challenge }
}

/** A token signed directly with `key` — to forge every shape the guard must refuse. */
const forged = async (
  key: KeyPairModel, credential: Partial<AuthCredentials>, { type = AuthenticationType.ReCaptcha as string, ttl = AUTHEN_TIMEFRAME as number | null } = {}
): Promise<string> => await makeEnvelopeModel<AuthCredentials>(type).send({
  type: AuthenticationType.ReCaptcha, role: AuthRole.Guest, userId: GUEST_ID, scopes: [AUTH_SCOPE],
  challenge: `challenge-${crypto.randomUUID()}`, ...credential,
} as AuthCredentials, ttl).sign(key, EnvelopeKind.Token)

const admit = async ({ guard }: Setup, token: string): Promise<Auth | null> => {
  let resolved: Auth | null = null
  const req = { headers: { authorization: `RE-CAPTCHA ${token}` } } as never
  const res = { resolve: (auth: Auth) => { resolved = auth } } as never

  return await guard.handle<boolean>(req, res) ? resolved : null
}

const refusal = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('expected a refusal')
}

describe('@owlmeans/server-auth — reCAPTCHA plugin', () => {
  test('signs a guest whatever identity the caller posted, after asking the verifier', async () => {
    const env = await setup()
    const { token, challenge } = await signIn(env, {
      profileId: 'profile-1', entitySlug: 'acme', entityId: 'acme-id', permissions: [{ scope: 'x', permissions: [] }],
      groups: ['admins'], expiresAt: new Date(Date.now() + 1e9), source: 'previous-challenge', publicKey: 'pk',
    })

    expect(env.asked).toEqual([{ secret: 'recaptcha-secret', response: 'google-response-token' }])

    const envelope = makeEnvelopeModel<AuthCredentials>(token, EnvelopeKind.Token)
    expect(envelope.type()).toBe(AuthenticationType.ReCaptcha)
    const credential = envelope.message<AuthCredentials>()
    expect(credential).toEqual({
      type: AuthenticationType.ReCaptcha, role: AuthRole.Guest, userId: GUEST_ID, scopes: [AUTH_SCOPE],
      // The server-issued challenge is the spend key; the stamp is the auth record's id.
      challenge, credential: env.authServiceRecord.id,
    })
  })

  test('applies the policy of the plugin record: hostname, score, action, Google\'s own refusal', async () => {
    const cases: [Partial<ReCaptchaResponse>, string | null][] = [
      [{ hostname: 'owlmeans.com' }, null],
      [{ hostname: 'Platform.OwlMeans.com.' }, null],
      [{ hostname: 'evil.com' }, 'recaptcha:hostname'],
      [{ hostname: 'notowlmeans.org' }, 'recaptcha:hostname'],
      [{ hostname: '' }, 'recaptcha:hostname'],
      [{ score: 0.3 }, 'recaptcha:score'],
      [{ score: 0.5 }, null],
      [{ score: undefined }, null],
      [{ action: 'login' }, 'recaptcha:action'],
      [{ action: undefined }, 'recaptcha:action'],
      [{ success: false, 'error-codes': ['timeout-or-duplicate'] }, 'recaptcha:timeout-or-duplicate'],
      [{ success: false }, 'recaptcha:unknown'],
    ]
    for (const [answer, reason] of cases) {
      const env = await setup(POLICY, { ...GOOD, ...answer })
      if (reason == null) {
        expect(await signIn(env)).toHaveProperty('token')
      } else {
        const error = await refusal(signIn(env))
        expect([answer, error]).toEqual([answer, expect.any(AuthenFailed)])
        expect(error.message).toContain(reason)
      }
    }
  })

  test('an empty policy field is no check; no secret is no reCAPTCHA sign-in', async () => {
    const open = await setup({ id: MOD_RECAPTCHA, value: 'recaptcha-secret', hostnames: '', minScore: '', actions: '' }, {
      success: true, challenge_ts: '2026-10-06T10:00:00Z', hostname: 'anywhere.example',
    })
    expect(await signIn(open)).toHaveProperty('token')

    for (const record of [{ id: MOD_RECAPTCHA, value: '' }, null]) {
      const env = await setup(record)
      expect(await refusal(signIn(env))).toBeInstanceOf(PluginMissconfigured)
      expect(env.asked).toHaveLength(0)
    }
  })

  test('the policy model parses the record as a mounted file delivers it', () => {
    const policy = makeReCaptchaPolicyModel({ id: MOD_RECAPTCHA, hostnames: ' a.org,b.com  *.c.net ', minScore: '0.7', actions: 'inquiry, contact' })

    expect(policy.hostnames()).toEqual(['a.org', 'b.com', 'c.net'])
    expect(policy.minScore()).toBe(0.7)
    expect(policy.actions()).toEqual(['inquiry', 'contact'])
    expect(makeReCaptchaPolicyModel({ id: MOD_RECAPTCHA, minScore: 0 }).minScore()).toBe(0)
    for (const minScore of ['high', '1.5', '-0.1']) {
      expect(() => makeReCaptchaPolicyModel({ id: MOD_RECAPTCHA, minScore }).minScore()).toThrow(PluginMissconfigured)
    }
  })
})

describe('@owlmeans/server-auth — the default reCAPTCHA verifier', () => {
  const answering = (status: number, body: unknown, calls: { url: string, init: RequestInit }[] = []): ReCaptchaFetch =>
    async (url, init) => {
      calls.push({ url, init })
      return new Response(JSON.stringify(body), { status })
    }

  test('posts the siteverify form to Google over https', async () => {
    const calls: { url: string, init: RequestInit }[] = []
    const verifier = createReCaptchaVerifierService(RECAPTCHA_VERIFIER, { fetch: answering(200, GOOD, calls) })

    expect(await verifier.verify({ secret: 's', response: 'r', remoteip: '203.0.113.7' })).toEqual(GOOD)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(RECAPTCHA_SITEVERIFY_URL)
    expect(RECAPTCHA_SITEVERIFY_URL).toStartWith('https://www.google.com/')
    expect(calls[0].init.method).toBe('POST')
    expect(Object.fromEntries(calls[0].init.body as URLSearchParams)).toEqual({ secret: 's', response: 'r', remoteip: '203.0.113.7' })
  })

  test('an unreachable or unreadable Google is unavailability, not a refusal', async () => {
    const failing: ReCaptchaFetch = async () => { throw new Error('offline') }
    for (const fetch of [failing, answering(500, {}), answering(200, { nothing: true })]) {
      await expect(createReCaptchaVerifierService(RECAPTCHA_VERIFIER, { fetch }).verify({ secret: 's', response: 'r' }))
        .rejects.toBeInstanceOf(AuthUnavailable)
    }
  })

  test('refuses a siteverify address that is not https', () => {
    expect(() => createReCaptchaVerifierService(RECAPTCHA_VERIFIER, { url: 'http://www.google.com/recaptcha/api/siteverify' }))
      .toThrow(SyntaxError)
  })
})

describe('@owlmeans/server-auth — reCAPTCHA guard', () => {
  test('admits a manager-issued guest token once, as a guest that carries no token', async () => {
    const env = await setup()
    const { token } = await signIn(env, { profileId: 'profile-1', entitySlug: 'acme' })

    expect(await env.guard.match({ headers: { authorization: `RE-CAPTCHA ${token}` } } as never, {} as never)).toBe(true)
    const auth = await admit(env, token)

    expect(auth).toMatchObject({
      token: '', type: AuthenticationType.ReCaptcha, role: AuthRole.Guest, userId: GUEST_ID, scopes: [AUTH_SCOPE], isUser: false,
    })
    expect(auth?.profileId).toBeUndefined()
    expect(auth?.entitySlug).toBeUndefined()
    expect(auth?.expiresAt?.getTime()).toBeGreaterThan(Date.now())
    // Replay: the same token never admits a second request.
    expect(await admit(env, token)).toBeNull()
  })

  test('inspection does not spend: the guard still admits after it', async () => {
    const env = await setup()
    const { token, challenge } = await signIn(env)
    const tokens = reCaptchaTokenOf(env.context as never)
    const req = { headers: { authorization: `RE-CAPTCHA ${token}` } }

    expect((await tokens.inspect(req))?.challenge).toBe(challenge)
    expect(await tokens.inspect(req)).not.toBeNull()
    expect(await admit(env, token)).not.toBeNull()
    // Spent now — but inspection judges only the token, the guard judges the spend.
    expect(await tokens.inspect(req)).not.toBeNull()
    expect(await admit(env, token)).toBeNull()
    expect(await tokens.inspect({ headers: {} })).toBeNull()
    expect(await tokens.inspect({ headers: { authorization: `ED25519-BASIC-TOKEN ${token}` } })).toBeNull()
  })

  test('refuses a wrong type, a non-guest, a foreign stamp, a bad signature, an expired or long-lived token', async () => {
    const env = await setup()
    const key = env.authServiceKP
    const stamp = env.authServiceRecord.id

    const refused = [
      // Another method's token under the auth key, whatever it claims inside.
      await forged(key, { credential: stamp, type: AuthenticationType.OneTimeToken }, { type: AuthenticationType.OneTimeToken }),
      await forged(key, { credential: stamp }, { type: AuthenticationType.OneTimeToken }),
      await forged(key, { credential: stamp, type: AuthenticationType.OneTimeToken }),
      await forged(key, { credential: stamp, role: AuthRole.User }),
      await forged(key, { credential: stamp, userId: 'person@example.com' }),
      await forged(key, { credential: 'someone-else' }),
      await forged(key, { credential: stamp, challenge: '' }),
      await forged(makeFixtureKeyPair('foreign-signer'), { credential: stamp }),
      await forged(key, { credential: stamp }, { ttl: null }),
      await forged(key, { credential: stamp }, { ttl: AUTHEN_TIMEFRAME + 1 }),
      'not-a-token',
    ]
    const expired = await forged(key, { credential: stamp }, { ttl: 1 })
    await Bun.sleep(5)
    refused.push(expired)

    for (const token of refused) {
      expect([token, await admit(env, token)]).toEqual([token, null])
    }
    // The same shape, well formed, is admitted.
    expect(await admit(env, await forged(key, { credential: stamp }))).not.toBeNull()
  })

  test('does not match another authorization scheme', async () => {
    const env = await setup()

    expect(await env.guard.match({ headers: { authorization: 'ED25519-BASIC-TOKEN abc' } } as never, {} as never)).toBe(false)
    expect(await env.guard.match({ headers: {} } as never, {} as never)).toBe(false)
  })
})

describe('@owlmeans/server-auth — a guest token never becomes a session', () => {
  test('the bearer exchange refuses a reCAPTCHA token, and leaves it unspent', async () => {
    const env = await setup()
    const { token } = await signIn(env)

    expect(await refusal(env.bearer.authenticate({ token }))).toBeInstanceOf(AuthenFailed)
    expect(await admit(env, token)).not.toBeNull()
  })

  test('also when only the envelope or only the credential says reCAPTCHA', async () => {
    const env = await setup()
    const stamp = env.authServiceRecord.id

    for (const token of [
      await forged(env.authServiceKP, { credential: stamp, type: AuthenticationType.OneTimeToken, role: AuthRole.User, userId: 'u' }),
      await forged(env.authServiceKP, { credential: stamp }, { type: AuthenticationType.OneTimeToken }),
    ]) {
      const error = await refusal(env.bearer.authenticate({ token }))
      expect(error).toBeInstanceOf(AuthenFailed)
      expect(error.message).toContain('guest')
    }
  })
})
