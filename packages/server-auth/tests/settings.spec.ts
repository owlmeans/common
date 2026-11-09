import { describe, expect, test } from 'bun:test'
import { AuthenFailed, AuthenticationType, AuthorizationError, AuthRole, GUEST_ID, AUTH_SCOPE } from '@owlmeans/auth'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { KeyPairModel } from '@owlmeans/basic-keys'
import { AUTH_SESSION_TTL } from '@owlmeans/server-auth-session'
import { AUTH_SRV_KEY, AUTHEN_TIMEFRAME, DEFAULT_ALIAS } from '../src/consts.js'
import { makeAuthModel } from '../src/manager/model.js'
import { authEvents, authSettingsOf, reCaptchaTokenOf } from '../src/index.js'
import type { AuthService, AuthServiceSettings } from '../src/types.js'
import { makeTestContext, OPERATOR_KEY, signInThrough, TEST_LOGIN, throughGuard } from './context.js'

const HALF_DAY = 12 * 60 * 60 * 1000

/** A deployment that moved both keys and the lifetime off the defaults. */
const OPERATOR: AuthServiceSettings = { tokenKey: OPERATOR_KEY, authKey: OPERATOR_KEY, sessionTtl: HALF_DAY }

const setup = async (opts: Parameters<typeof makeTestContext>[0] = {}) => {
  const fixture = makeTestContext({ sessions: true, ...opts })
  fixture.context.configure()
  await fixture.context.init()

  return fixture
}

const who = { userId: 'account-1', profileId: 'profile-1', entitySlug: 'entity-1' }

const envelopeOf = (bearer: string) => makeEnvelopeModel<Auth>(bearer.split(' ')[1]!, EnvelopeKind.Token)

const verifies = async (token: string, key: KeyPairModel, kind: EnvelopeKind = EnvelopeKind.Token): Promise<boolean> =>
  await makeEnvelopeModel(token, kind).verify(key)

describe('@owlmeans/server-auth — defaults are unchanged', () => {
  test('without `cfg.auth`: the token key is the alias or the service, the auth key AUTH_SRV_KEY, seven days', async () => {
    const plain = makeTestContext()
    const aliased = makeTestContext({ alias: 'platform' })

    expect(authSettingsOf(plain.context).tokenKey()).toBe('server-auth-tests')
    expect(authSettingsOf(aliased.context).tokenKey()).toBe('platform')
    expect(authSettingsOf(plain.context).authKey()).toBe(AUTH_SRV_KEY)
    expect(AUTH_SRV_KEY).toBe('auth-service')
    expect(authSettingsOf(plain.context).sessionTtl()).toBe(AUTH_SESSION_TTL)
    expect(AUTH_SESSION_TTL).toBe(7 * 24 * 60 * 60 * 1000)
  })

  test('a sign-in signs with `auth-service`, the bearer with the service key, for seven days, with no listener', async () => {
    const { context, authServiceKP, appKP, operatorKP } = await setup()
    expect(authEvents(context)).not.toBeNull()

    const startedAt = Date.now()
    const { challenge, credential, bearer } = await signInThrough(context, who)

    expect(await verifies(challenge, authServiceKP, EnvelopeKind.Wrap)).toBe(true)
    expect(await verifies(credential, authServiceKP)).toBe(true)
    expect(await envelopeOf(bearer).verify(appKP)).toBe(true)
    expect(await envelopeOf(bearer).verify(operatorKP)).toBe(false)
    const auth = envelopeOf(bearer).message()
    expect(new Date(auth.expiresAt!).getTime() - startedAt).toBeGreaterThanOrEqual(AUTH_SESSION_TTL - 1000)
    expect(new Date(auth.expiresAt!).getTime() - startedAt).toBeLessThanOrEqual(AUTH_SESSION_TTL + 1000)
    expect(envelopeOf(bearer).envelope.ttl!).toBeWithin(AUTH_SESSION_TTL - 1000, AUTH_SESSION_TTL + 1)
    expect((await throughGuard(context, bearer)).admitted).toBe(true)
  })

  test('an unusable lifetime is a configuration fault, not a token', async () => {
    for (const sessionTtl of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { context } = makeTestContext({ auth: { sessionTtl } })
      expect(() => authSettingsOf(context).sessionTtl()).toThrow('auth:session-ttl')
    }
    const { context } = makeTestContext({ auth: { tokenKey: '', authKey: '' } })
    expect(authSettingsOf(context).tokenKey()).toBe('server-auth-tests')
    expect(authSettingsOf(context).authKey()).toBe(AUTH_SRV_KEY)
  })
})

describe('@owlmeans/server-auth — a deployment of its own keys (`cfg.auth`)', () => {
  test('challenge, credential and bearer are signed by the configured keys; the session lasts `sessionTtl`', async () => {
    const { context, authServiceKP, appKP, operatorKP } = await setup({ auth: OPERATOR })

    const startedAt = Date.now()
    const { challenge, credential, bearer } = await signInThrough(context, who)

    expect(await verifies(challenge, operatorKP, EnvelopeKind.Wrap)).toBe(true)
    expect(await verifies(challenge, authServiceKP, EnvelopeKind.Wrap)).toBe(false)
    expect(await verifies(credential, operatorKP)).toBe(true)
    expect(await verifies(credential, authServiceKP)).toBe(false)
    expect(await envelopeOf(bearer).verify(operatorKP)).toBe(true)
    expect(await envelopeOf(bearer).verify(appKP)).toBe(false)
    const auth = envelopeOf(bearer).message()
    expect(new Date(auth.expiresAt!).getTime() - startedAt).toBeLessThanOrEqual(HALF_DAY + 1000)
    expect(new Date(auth.expiresAt!).getTime() - startedAt).toBeGreaterThanOrEqual(HALF_DAY - 1000)
    expect(envelopeOf(bearer).envelope.ttl!).toBeWithin(HALF_DAY - 1000, HALF_DAY + 1)

    const admitted = await throughGuard(context, bearer)
    expect(admitted.admitted).toBe(true)
    expect(admitted.auth?.userId).toBe(who.userId)
    expect((await context.service<AuthService>(DEFAULT_ALIAS).unpack(bearer)).profileId).toBe(who.profileId)
  })

  test('nothing minted under one pair of keys passes under the other', async () => {
    const platform = await setup()
    const operator = await setup({ auth: OPERATOR })
    const platformSignIn = await signInThrough(platform.context, who)
    const operatorSignIn = await signInThrough(operator.context, { ...who, userId: 'account-2' })

    // A bearer of one area at the other's guard.
    expect((await throughGuard(operator.context, platformSignIn.bearer)).admitted).toBe(false)
    expect((await throughGuard(platform.context, operatorSignIn.bearer)).admitted).toBe(false)
    await expect(operator.context.service<AuthService>(DEFAULT_ALIAS).unpack(platformSignIn.bearer))
      .rejects.toBeInstanceOf(AuthorizationError)

    // A manager credential of one area at the other's exchange.
    const fresh = await makeEnvelopeModel<AuthCredentials>(TEST_LOGIN).send({
      type: TEST_LOGIN, challenge: `fresh-${crypto.randomUUID()}`, credential: platform.authServiceRecord.id,
      role: AuthRole.User, scopes: ['*'], ...who,
    }, AUTHEN_TIMEFRAME).sign(platform.authServiceKP, EnvelopeKind.Token)
    await expect(operator.context.service<AuthService>(DEFAULT_ALIAS).authenticate({ token: fresh }))
      .rejects.toBeInstanceOf(AuthenFailed)

    // A challenge of one area at the other's manager.
    const { challenge } = await makeAuthModel(platform.context as never).init({ type: TEST_LOGIN, userId: who.userId })
    await expect(makeAuthModel(operator.context as never).authenticate({
      type: TEST_LOGIN, challenge, credential: 'test', role: AuthRole.User, scopes: ['*'], ...who,
    } as AuthCredentials)).rejects.toThrow('challenge')
  })

  test('the reCAPTCHA guard verifies guest tokens with the configured auth key', async () => {
    const platform = await setup()
    const operator = await setup({ auth: OPERATOR })
    const guest = async (key: KeyPairModel, stamp: string): Promise<string> =>
      await makeEnvelopeModel<AuthCredentials>(AuthenticationType.ReCaptcha).send({
        type: AuthenticationType.ReCaptcha, role: AuthRole.Guest, userId: GUEST_ID, scopes: [AUTH_SCOPE],
        challenge: `challenge-${crypto.randomUUID()}`, credential: stamp,
      } as AuthCredentials, AUTHEN_TIMEFRAME).sign(key, EnvelopeKind.Token)

    const operatorGuest = await guest(operator.operatorKP, operator.operatorRecord.id)
    expect(await reCaptchaTokenOf(operator.context as never).verify(operatorGuest)).not.toBeNull()
    expect(await reCaptchaTokenOf(platform.context as never).verify(operatorGuest)).toBeNull()

    const platformGuest = await guest(platform.authServiceKP, platform.authServiceRecord.id)
    expect(await reCaptchaTokenOf(platform.context as never).verify(platformGuest)).not.toBeNull()
    expect(await reCaptchaTokenOf(operator.context as never).verify(platformGuest)).toBeNull()
  })
})
