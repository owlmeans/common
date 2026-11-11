import { describe, expect, test } from 'bun:test'
import {
  AUTH_SCOPE, AuthenFailed, AuthenticationType, AuthRole, AuthUnavailable, CAPTCHA_GUARD, GUEST_ID,
} from '@owlmeans/auth'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { KeyPairModel } from '@owlmeans/basic-keys'
import { ensureCaptchaService, makeCaptchaPolicyModel, MOD_CAPTCHA } from '@owlmeans/captcha'
import type { CaptchaPolicyRecord, CaptchaProvider, CaptchaVerdict, CaptchaVerifyOptions } from '@owlmeans/captcha'
import { appendConfigResource, PLUGIN_RECORD, PLUGINS, PluginMissconfigured } from '@owlmeans/config'
import type { GuardService } from '@owlmeans/entrypoint'
import { makeFixtureKeyPair } from '@owlmeans/test-auth'
import { AUTHEN_TIMEFRAME, DEFAULT_ALIAS } from '../src/consts.js'
import { makeAuthModel } from '../src/manager/model.js'
import { makeCaptchaGuard, captchaTokenOf } from '../src/index.js'
import type { AuthService } from '../src/types.js'
import { makeTestContext } from './context.js'

const POLICY: CaptchaPolicyRecord = {
  id: MOD_CAPTCHA, provider: 'test', hostnames: 'owlmeans.org, owlmeans.com', minScore: '0.5', actions: 'inquiry',
}

const GOOD: CaptchaVerdict = {
  success: true, at: '2026-10-06T10:00:00Z', hostname: 'vib-dev-1.owlmeans.org', score: 0.9, action: 'inquiry',
}

interface Asked extends CaptchaVerifyOptions { token: string }

/** A provider that answers `verdict` and records what it was asked — no network, no provider name. */
const provide = (verdict: CaptchaVerdict, asked: Asked[], id = 'test'): CaptchaProvider => ({
  id,
  verify: async (token, options) => { asked.push({ token, ...options }); return verdict },
  clientSettings: () => ({ provider: id, siteKey: 'site-key' }),
})

interface SetupOptions {
  /** The `MOD_CAPTCHA` host record; `null` declares none. */
  record?: Partial<CaptchaPolicyRecord> | null
  verdict?: CaptchaVerdict
  /** The providers registered in the captcha host; default one `test` provider answering `verdict`. */
  providers?: string[]
}

/**
 * The auth manager and an API server in one context: the auth service's trusted record, the auth
 * cache, the `MOD_CAPTCHA` host record, a stand-in provider in the captcha host (no network), the
 * bearer guard and the captcha guard.
 */
const setup = async ({ record = POLICY, verdict = GOOD, providers = ['test'] }: SetupOptions = {}) => {
  const fixture = makeTestContext()
  const { context } = fixture
  const cfg = context.cfg as unknown as Record<string, unknown>
  cfg[PLUGIN_RECORD] = record == null ? [] : [{ ...record }]
  appendConfigResource(context as never, PLUGINS, PLUGIN_RECORD)

  const asked: Asked[] = []
  for (const id of providers) {
    ensureCaptchaService(context).register(provide(verdict, asked, id))
  }
  context.registerService(makeCaptchaGuard())

  context.configure()
  await context.init()

  const model = makeAuthModel(context as never)
  const guard = context.service<GuardService>(CAPTCHA_GUARD)
  const bearer = context.service<AuthService>(DEFAULT_ALIAS)

  return { ...fixture, model, guard, bearer, asked }
}

type Setup = Awaited<ReturnType<typeof setup>>

/** A sign-in through the manager, posting whatever identity the caller likes. */
const signIn = async ({ model }: Setup, overrides: Record<string, unknown> = {}): Promise<{ token: string, challenge: string }> => {
  const { challenge } = await model.init({ type: AuthenticationType.Captcha, userId: 'anyone' })
  const { token } = await model.authenticate({
    type: AuthenticationType.Captcha, challenge, credential: 'provider-response-token',
    userId: 'victim@example.com', role: AuthRole.Admin, scopes: ['*'],
    ...overrides,
  } as AuthCredentials)

  return { token, challenge }
}

/** A token signed directly with `key` — to forge every shape the guard must refuse. */
const forged = async (
  key: KeyPairModel, credential: Partial<AuthCredentials>, { type = AuthenticationType.Captcha as string, ttl = AUTHEN_TIMEFRAME as number | null } = {}
): Promise<string> => await makeEnvelopeModel<AuthCredentials>(type).send({
  type: AuthenticationType.Captcha, role: AuthRole.Guest, userId: GUEST_ID, scopes: [AUTH_SCOPE],
  challenge: `challenge-${crypto.randomUUID()}`, ...credential,
} as AuthCredentials, ttl).sign(key, EnvelopeKind.Token)

const admit = async ({ guard }: Setup, token: string): Promise<Auth | null> => {
  let resolved: Auth | null = null
  const req = { headers: { authorization: `CAPTCHA ${token}` } } as never
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

describe('@owlmeans/server-auth — captcha plugin', () => {
  test('signs a guest whatever identity the caller posted, after asking the provider the record names', async () => {
    const env = await setup()
    const { token, challenge } = await signIn(env, {
      profileId: 'profile-1', entitySlug: 'acme', entityId: 'acme-id', permissions: [{ scope: 'x', permissions: [] }],
      groups: ['admins'], expiresAt: new Date(Date.now() + 1e9), source: 'previous-challenge', publicKey: 'pk',
    })

    expect(env.asked).toEqual([{ token: 'provider-response-token' }])

    const envelope = makeEnvelopeModel<AuthCredentials>(token, EnvelopeKind.Token)
    expect(envelope.type()).toBe(AuthenticationType.Captcha)
    expect(AuthenticationType.Captcha as string).toBe('captcha')
    const credential = envelope.message<AuthCredentials>()
    expect(credential).toEqual({
      type: AuthenticationType.Captcha, role: AuthRole.Guest, userId: GUEST_ID, scopes: [AUTH_SCOPE],
      // The server-issued challenge is the spend key; the stamp is the auth record's id.
      challenge, credential: env.authServiceRecord.id,
    })
  })

  test('applies the policy of the host record: hostname, score, action, the provider\'s own refusal', async () => {
    const cases: [Partial<CaptchaVerdict>, string | null][] = [
      [{ hostname: 'owlmeans.com' }, null],
      [{ hostname: 'Platform.OwlMeans.com.' }, null],
      [{ hostname: 'evil.com' }, 'captcha:hostname'],
      [{ hostname: 'notowlmeans.org' }, 'captcha:hostname'],
      [{ hostname: '' }, 'captcha:hostname'],
      [{ score: 0.3 }, 'captcha:score'],
      [{ score: 0.5 }, null],
      [{ score: undefined }, null],
      [{ action: 'login' }, 'captcha:action'],
      [{ action: undefined }, 'captcha:action'],
      [{ success: false, errors: ['timeout-or-duplicate'] }, 'captcha:timeout-or-duplicate'],
      [{ success: false }, 'captcha:unknown'],
    ]
    for (const [answer, reason] of cases) {
      const env = await setup({ verdict: { ...GOOD, ...answer } })
      if (reason == null) {
        expect(await signIn(env)).toHaveProperty('token')
      } else {
        const error = await refusal(signIn(env))
        expect([answer, error]).toEqual([answer, expect.any(AuthenFailed)])
        expect(error.message).toContain(reason)
      }
    }
  })

  test('an empty policy field is no check; the record without a provider id takes the only provider', async () => {
    const open = await setup({
      record: { id: MOD_CAPTCHA, hostnames: '', minScore: '', actions: '' },
      verdict: { success: true, at: '2026-10-06T10:00:00Z', hostname: 'anywhere.example' },
    })
    expect(await signIn(open)).toHaveProperty('token')
    expect(open.asked).toHaveLength(1)
  })

  test('fails closed: no host record is no captcha sign-in, whatever providers are registered', async () => {
    const env = await setup({ record: null })
    expect(await refusal(signIn(env))).toBeInstanceOf(PluginMissconfigured)
    expect(env.asked).toHaveLength(0)
  })

  test('fails closed: a host record whose provider is not registered is a boot error, and never a pass', async () => {
    // The guard (and the host's own boot check) refuse to start the context.
    await expect(setup({ providers: [] })).rejects.toThrow('captcha:provider:test')
    await expect(setup({ providers: ['other'] })).rejects.toThrow('captcha:provider:test')
    await expect(setup({ record: { id: MOD_CAPTCHA }, providers: ['one', 'two'] })).rejects.toBeInstanceOf(PluginMissconfigured)

    // A context that started without the check still refuses at sign-in — no built-in provider.
    const fixture = makeTestContext()
    const cfg = fixture.context.cfg as unknown as Record<string, unknown>
    cfg[PLUGIN_RECORD] = [{ ...POLICY }]
    fixture.context.configure()
    await fixture.context.init()
    const model = makeAuthModel(fixture.context as never)
    const { challenge } = await model.init({ type: AuthenticationType.Captcha, userId: 'anyone' })
    expect(await refusal(model.authenticate({
      type: AuthenticationType.Captcha, challenge, credential: 'token', userId: 'anyone',
    } as AuthCredentials))).toBeInstanceOf(PluginMissconfigured)
  })

  test('a provider that cannot be asked is unavailability, never a pass', async () => {
    const fixture = makeTestContext()
    const cfg = fixture.context.cfg as unknown as Record<string, unknown>
    cfg[PLUGIN_RECORD] = [{ ...POLICY }]
    ensureCaptchaService(fixture.context).register({
      id: 'test',
      verify: async () => { throw new AuthUnavailable('captcha') },
      clientSettings: () => ({ provider: 'test', siteKey: 'site-key' }),
    })
    fixture.context.configure()
    await fixture.context.init()
    const model = makeAuthModel(fixture.context as never)
    const { challenge } = await model.init({ type: AuthenticationType.Captcha, userId: 'anyone' })

    expect(await refusal(model.authenticate({
      type: AuthenticationType.Captcha, challenge, credential: 'token', userId: 'anyone',
    } as AuthCredentials))).toBeInstanceOf(AuthUnavailable)
  })

  test('the policy model parses the record as a mounted file delivers it', () => {
    const policy = makeCaptchaPolicyModel({ id: MOD_CAPTCHA, hostnames: ' a.org,b.com  *.c.net ', minScore: '0.7', actions: 'inquiry, contact' })

    expect(policy.hostnames()).toEqual(['a.org', 'b.com', 'c.net'])
    expect(policy.minScore()).toBe(0.7)
    expect(policy.actions()).toEqual(['inquiry', 'contact'])
    for (const minScore of ['high', '1.5', '-0.1']) {
      const env = makeCaptchaPolicyModel({ id: MOD_CAPTCHA, minScore })
      expect(() => env.minScore()).toThrow(PluginMissconfigured)
    }
  })
})

describe('@owlmeans/server-auth — captcha guard', () => {
  test('admits a manager-issued guest token once, as a guest that carries no token', async () => {
    const env = await setup()
    const { token } = await signIn(env, { profileId: 'profile-1', entitySlug: 'acme' })

    expect(await env.guard.match({ headers: { authorization: `CAPTCHA ${token}` } } as never, {} as never)).toBe(true)
    const auth = await admit(env, token)

    expect(auth).toMatchObject({
      token: '', type: AuthenticationType.Captcha, role: AuthRole.Guest, userId: GUEST_ID, scopes: [AUTH_SCOPE], isUser: false,
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
    const tokens = captchaTokenOf(env.context as never)
    const req = { headers: { authorization: `CAPTCHA ${token}` } }

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
  test('the bearer exchange refuses a captcha guest token, and leaves it unspent', async () => {
    const env = await setup()
    const { token } = await signIn(env)

    expect(await refusal(env.bearer.authenticate({ token }))).toBeInstanceOf(AuthenFailed)
    expect(await admit(env, token)).not.toBeNull()
  })

  test('also when only the envelope or only the credential says captcha', async () => {
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
