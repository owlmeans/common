import { describe, expect, test } from 'bun:test'
import { AuthenFailed, AuthenticationType, AuthUnknown } from '@owlmeans/auth'
import {
  EMAIL_CONFIRM_ENVELOPE, EMAIL_PASSWORD_AUTH_TYPE, EMAIL_PIN_AUTH_TYPE, EmailPasswordDisabled, EmailSignInReason,
} from '@owlmeans/auth-email'
import { OTP_AUTH_TYPE } from '@owlmeans/auth-otp'
import { makeAuthModel } from '@owlmeans/server-auth/manager'
import { appendOtpPlugin } from '@owlmeans/server-auth-otp'
import { passwordHasher } from '../src/hasher.js'
import { DEVICE_A, DEVICE_B, DEVICE_C, failure, makeEmailAuthFixture, otherCode, statusOf, tokenOf } from './context.js'

describe('@owlmeans/server-auth-email — PIN sign-in', () => {
  test('send-PIN answers the same for a known and an unknown address, and mails each a PIN', async () => {
    const env = await makeEmailAuthFixture()
    await env.pinSignIn('known@example.org')
    const mails = env.mailer.captured.length

    const known = await env.service.sendPin({ email: 'Known@Example.org ' }, env.guest())
    const unknown = await env.service.sendPin({ email: 'nobody@example.org' }, env.guest())

    expect(Object.keys(known)).toEqual(['challenge'])
    expect(Object.keys(unknown)).toEqual(['challenge'])
    expect(env.mailer.captured.slice(mails).map(mail => mail.to)).toEqual(['known@example.org', 'nobody@example.org'])
    expect(await env.accountOf('nobody@example.org')).toBeNull()
  })

  test('a PIN registers a new address, stamps the token email-pin, remembers the device and offers a password', async () => {
    const env = await makeEmailAuthFixture()
    const { challenge } = await env.service.sendPin({ email: 'new@example.org', locale: 'pl-PL' }, env.guest())
    expect(env.mailer.captured[0]!.subject).toBe('Twój kod logowania')

    const answer = await env.service.signIn({ email: 'new@example.org', device: DEVICE_A, challenge, pin: env.codeOf() }, env.guest())

    const account = await env.accountOf('new@example.org')
    const credential = tokenOf(answer.token!)
    expect(account).not.toBeNull()
    expect(credential.type).toBe(EMAIL_PIN_AUTH_TYPE)
    expect(credential.type).not.toBe(OTP_AUTH_TYPE)
    expect(credential.type).not.toBe(AuthenticationType.OneTimeToken)
    expect(credential.userId).toBe(account!.id)
    // The bearer exchange takes the token through the shared AuthTokenSchema (maxLength 1024): the
    // token carries a short spend key, never the wrapped PIN challenge.
    expect(answer.token!.length).toBeLessThanOrEqual(1024)
    expect(credential.challenge).toMatch(/^auth-email:[A-Za-z0-9_-]{43}$/)
    expect(credential.challenge).not.toContain('new@example.org')
    expect(typeof answer.offer).toBe('string')
    const { items } = await env.devices().list({ accountId: account!.id })
    expect(items).toHaveLength(1)
    expect(JSON.stringify(items)).not.toContain(DEVICE_A)
  })

  test('a wrong PIN is a 401 AuthenFailed; the PIN plugin keeps the five-attempt limit', async () => {
    const env = await makeEmailAuthFixture()
    const { challenge } = await env.service.sendPin({ email: 'guess@example.org' }, env.guest())
    const code = env.codeOf()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const error = await failure(env.service.signIn({ email: 'guess@example.org', device: DEVICE_A, challenge, pin: otherCode(code) }, env.guest()))
      expect(error).toBeInstanceOf(AuthenFailed)
      expect(statusOf(error)).toBe(401)
    }
    expect(await failure(env.service.signIn({ email: 'guess@example.org', device: DEVICE_A, challenge, pin: code }, env.guest())))
      .toBeInstanceOf(AuthenFailed)
  })

  test('no offer without the password feature, or once the person declined', async () => {
    const off = await makeEmailAuthFixture({ password: false })
    expect((await off.pinSignIn('off@example.org')).offer).toBeUndefined()

    const env = await makeEmailAuthFixture()
    const first = await env.pinSignIn('decline@example.org')
    expect(first.offer).toBeDefined()
    await env.service.decline(env.session(first.accountId))
    expect((await env.pinSignIn('decline@example.org')).offer).toBeUndefined()
  })
})

describe('@owlmeans/server-auth-email — password sign-in', () => {
  const setUp = async () => {
    const env = await makeEmailAuthFixture()
    const { accountId, offer } = await env.pinSignIn('pass@example.org', DEVICE_A)
    await env.service.setPassword({ password: 'correct horse battery', offer, device: DEVICE_A }, env.session(accountId))

    return { env, accountId }
  }

  test('on a known device the right password signs in, stamped email-password', async () => {
    const { env, accountId } = await setUp()

    const answer = await env.service.signIn({ email: 'pass@example.org', device: DEVICE_A, password: 'correct horse battery' }, env.guest())

    const credential = tokenOf(answer.token!)
    expect(credential.type).toBe(EMAIL_PASSWORD_AUTH_TYPE)
    expect(credential.userId).toBe(accountId)
    expect(answer.token!.length).toBeLessThanOrEqual(1024)
    expect(credential.challenge).toMatch(/^auth-email:[A-Za-z0-9_-]{43}$/)
    expect(answer.challenge).toBeUndefined()
  })

  test('an unknown device, a missing account and a wrong password on an unknown device answer alike — and mail a PIN', async () => {
    const { env } = await setUp()
    const mails = env.mailer.captured.length

    const answers = [
      await env.service.signIn({ email: 'pass@example.org', device: DEVICE_B, password: 'correct horse battery' }, env.guest()),
      await env.service.signIn({ email: 'pass@example.org', device: DEVICE_B, password: 'wrong password!' }, env.guest()),
      await env.service.signIn({ email: 'missing@example.org', device: DEVICE_A, password: 'whatever it is' }, env.guest()),
    ]

    for (const answer of answers) {
      expect(Object.keys(answer).sort()).toEqual(['challenge', 'reason'])
      expect(answer.reason).toBe(EmailSignInReason.Device)
    }
    expect(env.mailer.captured.slice(mails).map(mail => mail.to)).toEqual(['pass@example.org', 'pass@example.org', 'missing@example.org'])
    expect(await env.accountOf('missing@example.org')).toBeNull()
    // The device answer's challenge is a sign-in PIN: it signs the device in and remembers it.
    const signedIn = await env.service.signIn({
      email: 'pass@example.org', device: DEVICE_B, challenge: answers[1]!.challenge, pin: env.codeOf(mails + 1),
    }, env.guest())
    expect(tokenOf(signedIn.token!).type).toBe(EMAIL_PIN_AUTH_TYPE)
  })

  test('on a known device "no password" and "wrong password" are the same 401 AuthenFailed(email:password)', async () => {
    const { env } = await setUp()
    const wrong = await failure(env.service.signIn({ email: 'pass@example.org', device: DEVICE_A, password: 'not the one' }, env.guest()))

    const bare = await makeEmailAuthFixture()
    await bare.pinSignIn('bare@example.org', DEVICE_A)
    const none = await failure(bare.service.signIn({ email: 'bare@example.org', device: DEVICE_A, password: 'not the one' }, bare.guest()))

    for (const error of [wrong, none]) {
      expect(error).toBeInstanceOf(AuthenFailed)
      expect(error.message).toBe('auth:manager:authen:email:password')
      expect(statusOf(error)).toBe(401)
    }
  })

  test('the password routes answer EmailPasswordDisabled while passwords are off', async () => {
    const env = await makeEmailAuthFixture({ password: false })
    const { accountId } = await env.pinSignIn('nopass@example.org')

    const error = await failure(env.service.signIn({ email: 'nopass@example.org', device: DEVICE_A, password: 'any password' }, env.guest()))
    expect(error).toBeInstanceOf(EmailPasswordDisabled)
    expect(statusOf(error)).toBe(404)
    // Even a hash written behind its back is never checked.
    await env.passwords().create({ accountId, hash: await passwordHasher.hash('any password'), declined: false, createdAt: new Date(), updatedAt: new Date() })
    expect(await failure(env.service.signIn({ email: 'nopass@example.org', device: DEVICE_A, password: 'any password' }, env.guest())))
      .toBeInstanceOf(EmailPasswordDisabled)
  })
})

describe('@owlmeans/server-auth-email — exclusive plugins', () => {
  test('a challenge of a global type (email-otp, pk-supervisor, re-captcha) is refused at sign-in', async () => {
    const env = await makeEmailAuthFixture()
    appendOtpPlugin(env.context)
    // A real IAM e-mail-OTP challenge, issued through the global registry.
    const { challenge } = await makeAuthModel(env.context as never).init({ type: OTP_AUTH_TYPE, userId: 'iam@example.org' })
    const iamCode = env.codeOf()

    const presented = [
      challenge,
      await env.challengeOf(AuthenticationType.Supervisor, 'iam@example.org::whatever'),
      await env.challengeOf(AuthenticationType.ReCaptcha, 'iam@example.org::whatever'),
    ]
    for (const foreign of presented) {
      const error = await failure(env.service.signIn({ email: 'iam@example.org', device: DEVICE_A, challenge: foreign, pin: iamCode }, env.guest()))
      expect(error).toBeInstanceOf(AuthUnknown)
    }
    expect(await env.accountOf('iam@example.org')).toBeNull()
  })

  test('a confirmation challenge is refused at sign-in; a body naming no single mode is a 400', async () => {
    const env = await makeEmailAuthFixture()
    const { accountId } = await env.pinSignIn('mode@example.org')
    const { challenge } = await env.service.confirmPin({ purpose: 'set' as never }, env.session(accountId))

    const confirm = await failure(env.service.signIn({ email: 'mode@example.org', device: DEVICE_A, challenge, pin: env.codeOf() }, env.guest()))
    expect(confirm).toBeInstanceOf(AuthUnknown)
    expect(confirm.message).toContain(EMAIL_CONFIRM_ENVELOPE)

    for (const body of [
      { email: 'mode@example.org', device: DEVICE_A },
      { email: 'mode@example.org', device: DEVICE_A, challenge, pin: '123456', password: 'both modes at once' },
      { email: 'mode@example.org', device: DEVICE_A, challenge },
    ]) {
      const error = await failure(env.service.signIn(body, env.guest()))
      expect(error).toBeInstanceOf(AuthUnknown)
      expect(statusOf(error)).toBe(400)
    }
  })
})

describe('@owlmeans/server-auth-email — the new-device PIN', () => {
  const PASSWORD = 'correct horse battery'

  const setUp = async (opts: { devicePin?: boolean } = {}) => {
    const env = await makeEmailAuthFixture(opts)
    const { accountId, offer } = await env.pinSignIn('device@example.org', DEVICE_A)
    await env.service.setPassword({ password: PASSWORD, offer, device: DEVICE_A }, env.session(accountId))

    return { env, accountId }
  }

  /** The account's own choice, through the switch and its mailed confirmation. */
  const choose = async (env: Awaited<ReturnType<typeof setUp>>['env'], accountId: string, enabled: boolean) => {
    const { challenge } = await env.service.setDevicePin({ enabled }, env.session(accountId))
    await env.service.setDevicePin({ enabled, challenge, pin: env.codeOf() }, env.session(accountId))
  }

  test('off for the deployment: the right password signs a new device in, mails nothing and remembers it', async () => {
    const { env, accountId } = await setUp({ devicePin: false })
    const mails = env.mailer.captured.length

    const answer = await env.service.signIn({ email: 'device@example.org', device: DEVICE_B, password: PASSWORD }, env.guest())

    expect(Object.keys(answer)).toEqual(['token'])
    expect(tokenOf(answer.token!).type).toBe(EMAIL_PASSWORD_AUTH_TYPE)
    expect(tokenOf(answer.token!).userId).toBe(accountId)
    expect(env.mailer.captured.length).toBe(mails)
    expect((await env.devices().list({ accountId })).items).toHaveLength(2)
  })

  test('off for the deployment: a wrong password and an address with no account are the same 401', async () => {
    const { env } = await setUp({ devicePin: false })
    const mails = env.mailer.captured.length

    const errors = [
      await failure(env.service.signIn({ email: 'device@example.org', device: DEVICE_B, password: 'wrong password!' }, env.guest())),
      await failure(env.service.signIn({ email: 'missing@example.org', device: DEVICE_B, password: PASSWORD }, env.guest())),
    ]

    for (const error of errors) {
      expect(error).toBeInstanceOf(AuthenFailed)
      expect(error.message).toBe('auth:manager:authen:email:password')
      expect(statusOf(error)).toBe(401)
    }
    expect(env.mailer.captured.length).toBe(mails)
    expect(await env.accountOf('missing@example.org')).toBeNull()
  })

  test('on for the deployment, off for the account: its right password skips the PIN, a wrong one gets a PIN like any address', async () => {
    const { env, accountId } = await setUp()
    await choose(env, accountId, false)

    const right = await env.service.signIn({ email: 'device@example.org', device: DEVICE_B, password: PASSWORD }, env.guest())
    expect(tokenOf(right.token!).type).toBe(EMAIL_PASSWORD_AUTH_TYPE)

    for (const body of [
      { email: 'device@example.org', device: DEVICE_C, password: 'wrong password!' },
      { email: 'missing@example.org', device: DEVICE_C, password: PASSWORD },
    ]) {
      const answer = await env.service.signIn(body, env.guest())
      expect(Object.keys(answer).sort()).toEqual(['challenge', 'reason'])
      expect(answer.reason).toBe(EmailSignInReason.Device)
    }
  })

  test('off for the deployment, on for the account: a PIN after its right password; a wrong one is the same 401', async () => {
    const { env, accountId } = await setUp({ devicePin: false })
    await choose(env, accountId, true)
    const mails = env.mailer.captured.length

    const answer = await env.service.signIn({ email: 'device@example.org', device: DEVICE_B, password: PASSWORD }, env.guest())
    expect(Object.keys(answer).sort()).toEqual(['challenge', 'reason'])
    expect(env.mailer.captured.length).toBe(mails + 1)
    const signedIn = await env.service.signIn({
      email: 'device@example.org', device: DEVICE_B, challenge: answer.challenge, pin: env.codeOf(),
    }, env.guest())
    expect(tokenOf(signedIn.token!).type).toBe(EMAIL_PIN_AUTH_TYPE)

    const wrong = await failure(env.service.signIn({ email: 'device@example.org', device: DEVICE_C, password: 'wrong password!' }, env.guest()))
    expect(wrong.message).toBe('auth:manager:authen:email:password')
    expect(statusOf(wrong)).toBe(401)
    // A device the account remembers needs no PIN whatever the choice.
    const known = await env.service.signIn({ email: 'device@example.org', device: DEVICE_A, password: PASSWORD }, env.guest())
    expect(tokenOf(known.token!).type).toBe(EMAIL_PASSWORD_AUTH_TYPE)
  })
})
