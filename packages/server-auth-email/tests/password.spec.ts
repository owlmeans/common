import { describe, expect, test } from 'bun:test'
import { AuthenFailed, AuthForbidden, AuthUnknown } from '@owlmeans/auth'
import {
  EMAIL_PASSWORD_AUTH_TYPE, EmailOfferExpired, EmailPasswordDisabled, EmailPasswordPurpose, EmailPasswordWeak,
  EmailSignInReason,
} from '@owlmeans/auth-email'
import { DEVICE_A, DEVICE_B, DEVICE_C, failure, makeEmailAuthFixture, otherCode, statusOf, tokenOf } from './context.js'

const PASSWORD = 'correct horse battery'

describe('@owlmeans/server-auth-email — the offer ticket', () => {
  test('a PIN sign-in sets the first password with its offer — no second PIN — once', async () => {
    const env = await makeEmailAuthFixture()
    const { accountId, offer } = await env.pinSignIn('offer@example.org')
    const mails = env.mailer.captured.length

    const status = await env.service.setPassword({ password: PASSWORD, offer, device: DEVICE_A }, env.session(accountId))

    expect(status).toMatchObject({ enabled: true, set: true, declined: false })
    expect(typeof status.updatedAt).toBe('string')
    expect(env.mailer.captured.length).toBe(mails)
    expect((await env.passwords().load({ accountId }))!.hash).toStartWith('scrypt$32768$8$1$')
    // Spent: a second use is refused (and so is any use once a password exists).
    const again = await failure(env.service.setPassword({ password: 'another password', offer }, env.session(accountId)))
    expect(again).toBeInstanceOf(EmailOfferExpired)
    expect(statusOf(again)).toBe(409)
  })

  test('an offer is bound to its account: another account is refused and leaves it unspent', async () => {
    const env = await makeEmailAuthFixture()
    const owner = await env.pinSignIn('owner@example.org')
    const thief = await env.pinSignIn('thief@example.org')

    expect(await failure(env.service.setPassword({ password: PASSWORD, offer: owner.offer }, env.session(thief.accountId))))
      .toBeInstanceOf(EmailOfferExpired)
    expect((await env.service.status(env.session(thief.accountId))).set).toBe(false)
    expect((await env.service.setPassword({ password: PASSWORD, offer: owner.offer }, env.session(owner.accountId))).set).toBe(true)
  })

  test('a password the policy refuses spends neither the ticket nor the PIN', async () => {
    const env = await makeEmailAuthFixture()
    const { accountId, offer } = await env.pinSignIn('policy@example.org')

    for (const [password, reason] of [['short', 'length'], ['x'.repeat(129), 'length'], ['Policy@Example.org', 'email']] as const) {
      const error = await failure(env.service.setPassword({ password, offer }, env.session(accountId)))
      expect(error).toBeInstanceOf(EmailPasswordWeak)
      expect(error.message).toBe(`auth-email:weak:${reason}`)
      expect(statusOf(error)).toBe(422)
    }
    expect((await env.service.setPassword({ password: PASSWORD, offer }, env.session(accountId))).set).toBe(true)
  })
})

describe('@owlmeans/server-auth-email — confirmation PINs', () => {
  test('set by PIN (purpose set), then change by PIN (purpose change); a purpose that does not fit is refused', async () => {
    const env = await makeEmailAuthFixture()
    const { accountId } = await env.pinSignIn('confirm@example.org')
    const session = env.session(accountId)

    const set = await env.service.confirmPin({ purpose: EmailPasswordPurpose.Set, locale: 'de' }, session)
    expect(env.mailer.captured.at(-1)!.subject).toBe('Bestätigen Sie Ihr neues Passwort')
    expect(env.mailer.captured.at(-1)!.to).toBe('confirm@example.org')
    expect((await env.service.setPassword({ password: PASSWORD, challenge: set.challenge, pin: env.codeOf() }, session)).set).toBe(true)

    // A password exists now: a "set" confirmation no longer fits, a "change" one does.
    const stale = await env.service.confirmPin({ purpose: EmailPasswordPurpose.Set }, session)
    const purpose = await failure(env.service.setPassword({ password: 'a new password', challenge: stale.challenge, pin: env.codeOf() }, session))
    expect(purpose).toBeInstanceOf(AuthenFailed)
    expect(purpose.message).toBe('auth:manager:authen:email:purpose')
    const change = await env.service.confirmPin({ purpose: EmailPasswordPurpose.Change }, session)
    expect((await env.service.setPassword({ password: 'a new password', challenge: change.challenge, pin: env.codeOf() }, session)).set).toBe(true)
  })

  test('a sign-in PIN challenge is no confirmation, and a confirmation of another account is refused — 403, never 401', async () => {
    const env = await makeEmailAuthFixture()
    const alice = await env.pinSignIn('alice@example.org')
    const bob = await env.pinSignIn('bob@example.org')

    const signInChallenge = await env.service.sendPin({ email: 'alice@example.org' }, env.guest())
    const asConfirm = await failure(env.service.setPassword({
      password: PASSWORD, challenge: signInChallenge.challenge, pin: env.codeOf(),
    }, env.session(alice.accountId)))
    expect(asConfirm).toBeInstanceOf(AuthenFailed)
    expect(statusOf(asConfirm)).toBe(403)

    const bobs = await env.service.confirmPin({ purpose: EmailPasswordPurpose.Set }, env.session(bob.accountId))
    const foreign = await failure(env.service.setPassword({
      password: PASSWORD, challenge: bobs.challenge, pin: env.codeOf(),
    }, env.session(alice.accountId)))
    expect(foreign.message).toBe('auth:manager:authen:email:account')
    expect(statusOf(foreign)).toBe(403)

    const wrongPin = await env.service.confirmPin({ purpose: EmailPasswordPurpose.Set }, env.session(alice.accountId))
    const wrong = await failure(env.service.setPassword({
      password: PASSWORD, challenge: wrongPin.challenge, pin: otherCode(env.codeOf()),
    }, env.session(alice.accountId)))
    expect(wrong).toBeInstanceOf(AuthenFailed)
    expect(statusOf(wrong)).toBe(403)
    expect((await env.service.status(env.session(alice.accountId))).set).toBe(false)
  })

  test('a body with both an offer and a PIN, or with neither, is a 400', async () => {
    const env = await makeEmailAuthFixture()
    const { accountId, offer } = await env.pinSignIn('either@example.org')
    const { challenge } = await env.service.confirmPin({ purpose: EmailPasswordPurpose.Set }, env.session(accountId))

    for (const body of [{ password: PASSWORD }, { password: PASSWORD, offer, challenge, pin: env.codeOf() }]) {
      expect(await failure(env.service.setPassword(body, env.session(accountId)))).toBeInstanceOf(AuthUnknown)
    }
  })
})

describe('@owlmeans/server-auth-email — change, remove, decline', () => {
  test('a change forgets the other devices but keeps the current one; a remove does the same and declines', async () => {
    const env = await makeEmailAuthFixture()
    const { accountId, offer } = await env.pinSignIn('devices@example.org', DEVICE_A)
    await env.pinSignIn('devices@example.org', DEVICE_B)
    await env.pinSignIn('devices@example.org', DEVICE_C)
    expect((await env.devices().list({ accountId })).items).toHaveLength(3)

    await env.service.setPassword({ password: PASSWORD, offer, device: DEVICE_B }, env.session(accountId))
    expect((await env.devices().list({ accountId })).items).toHaveLength(1)
    await env.pinSignIn('devices@example.org', DEVICE_A)
    expect((await env.devices().list({ accountId })).items).toHaveLength(2)

    const { challenge } = await env.service.confirmPin({ purpose: EmailPasswordPurpose.Remove }, env.session(accountId))
    const removed = await env.service.removePassword({ challenge, pin: env.codeOf(), device: DEVICE_A }, env.session(accountId))
    expect(removed).toMatchObject({ enabled: true, set: false, declined: true })
    expect((await env.passwords().load({ accountId }))!.hash).toBeUndefined()
    expect((await env.devices().list({ accountId })).items).toHaveLength(1)
    // Device A is the one kept: a password there is checked (and there is none now); B gets a PIN.
    expect(await failure(env.service.signIn({ email: 'devices@example.org', device: DEVICE_A, password: PASSWORD }, env.guest())))
      .toBeInstanceOf(AuthenFailed)
    expect((await env.service.signIn({ email: 'devices@example.org', device: DEVICE_B, password: PASSWORD }, env.guest())).reason)
      .toBe(EmailSignInReason.Device)
  })

  test('remove takes only a remove confirmation; decline keeps an existing password', async () => {
    const env = await makeEmailAuthFixture()
    const { accountId, offer } = await env.pinSignIn('keep@example.org')
    await env.service.setPassword({ password: PASSWORD, offer, device: DEVICE_A }, env.session(accountId))

    const change = await env.service.confirmPin({ purpose: EmailPasswordPurpose.Change }, env.session(accountId))
    expect(await failure(env.service.removePassword({ challenge: change.challenge, pin: env.codeOf() }, env.session(accountId))))
      .toBeInstanceOf(AuthenFailed)

    const declined = await env.service.decline(env.session(accountId))
    expect(declined).toMatchObject({ set: true, declined: true })
    const answer = await env.service.signIn({ email: 'keep@example.org', device: DEVICE_A, password: PASSWORD }, env.guest())
    expect(tokenOf(answer.token!).type).toBe(EMAIL_PASSWORD_AUTH_TYPE)
  })

  test('every password route but status answers EmailPasswordDisabled while passwords are off; status says so', async () => {
    const env = await makeEmailAuthFixture({ password: false })
    const { accountId } = await env.pinSignIn('off@example.org')
    const session = env.session(accountId)

    expect(await env.service.status(session)).toEqual({ enabled: false, set: false, declined: false })
    for (const call of [
      env.service.confirmPin({ purpose: EmailPasswordPurpose.Set }, session),
      env.service.setPassword({ password: PASSWORD, offer: 'x' }, session),
      env.service.removePassword({ challenge: 'x', pin: '123456' }, session),
      env.service.decline(session),
    ]) {
      expect(await failure(call)).toBeInstanceOf(EmailPasswordDisabled)
    }
  })

  test('a session without an account behind it is refused', async () => {
    const env = await makeEmailAuthFixture()

    expect(await failure(env.service.status(env.session('no-such-account')))).toBeInstanceOf(AuthForbidden)
    expect(await failure(env.service.status(env.guest()))).toBeInstanceOf(AuthForbidden)
  })
})


describe('@owlmeans/server-auth-email — the new-device PIN switch', () => {
  const withPassword = async (opts: { devicePin?: boolean } = {}, email = 'switch@example.org') => {
    const env = await makeEmailAuthFixture(opts)
    const { accountId, offer } = await env.pinSignIn(email, DEVICE_A)
    await env.service.setPassword({ password: PASSWORD, offer, device: DEVICE_A }, env.session(accountId))

    return { env, accountId, session: env.session(accountId) }
  }

  test('status reports the PIN in effect; the switch mails a confirmation, then stores the choice once confirmed', async () => {
    const { env, accountId, session } = await withPassword()
    expect((await env.service.status(session)).devicePin).toBe(true)

    const first = await env.service.setDevicePin({ enabled: false, locale: 'de' }, session)
    expect(Object.keys(first)).toEqual(['challenge'])
    expect(env.mailer.captured.at(-1)!.subject).toBe('Bestätigen Sie die Einstellung für neue Geräte')
    expect(env.mailer.captured.at(-1)!.to).toBe('switch@example.org')
    expect((await env.service.status(session)).devicePin).toBe(true)

    const confirmed = await env.service.setDevicePin({ enabled: false, challenge: first.challenge, pin: env.codeOf() }, session)
    expect(confirmed.status).toMatchObject({ enabled: true, set: true, devicePin: false })
    expect((await env.passwords().load({ accountId }))!.devicePin).toBe(false)
    expect((await env.service.status(session)).devicePin).toBe(false)

    const off = await withPassword({ devicePin: false }, 'deployment@example.org')
    expect((await off.env.service.status(off.session)).devicePin).toBe(false)
  })

  test('the switch takes only its own confirmation, of its own account; a wrong PIN is a 403', async () => {
    const { env, session } = await withPassword()
    const other = await env.pinSignIn('other@example.org')

    const change = await env.service.confirmPin({ purpose: EmailPasswordPurpose.Change }, session)
    const purpose = await failure(env.service.setDevicePin({ enabled: false, challenge: change.challenge, pin: env.codeOf() }, session))
    expect(purpose.message).toBe('auth:manager:authen:email:purpose')
    expect(statusOf(purpose)).toBe(403)

    const own = await env.service.setDevicePin({ enabled: false }, session)
    const asPassword = await failure(env.service.setPassword({ password: 'a new password', challenge: own.challenge, pin: env.codeOf() }, session))
    expect(asPassword.message).toBe('auth:manager:authen:email:purpose')

    await env.service.setPassword({ password: PASSWORD, offer: other.offer, device: DEVICE_A }, env.session(other.accountId))
    const others = await env.service.setDevicePin({ enabled: false }, env.session(other.accountId))
    const foreign = await failure(env.service.setDevicePin({ enabled: false, challenge: others.challenge, pin: env.codeOf() }, session))
    expect(foreign.message).toBe('auth:manager:authen:email:account')

    const fresh = await env.service.setDevicePin({ enabled: false }, session)
    const wrong = await failure(env.service.setDevicePin({ enabled: false, challenge: fresh.challenge, pin: otherCode(env.codeOf()) }, session))
    expect(wrong).toBeInstanceOf(AuthenFailed)
    expect(statusOf(wrong)).toBe(403)
    expect((await env.service.status(session)).devicePin).toBe(true)
  })

  test('the switch needs a password, the challenge together with the PIN, and passwords on', async () => {
    const env = await makeEmailAuthFixture()
    const bare = await env.pinSignIn('bare@example.org')
    const unset = await failure(env.service.setDevicePin({ enabled: false }, env.session(bare.accountId)))
    expect(unset).toBeInstanceOf(AuthUnknown)
    expect(statusOf(unset)).toBe(400)

    const { env: set, session } = await withPassword()
    const { challenge } = await set.service.setDevicePin({ enabled: false }, session)
    expect(await failure(set.service.setDevicePin({ enabled: false, challenge }, session))).toBeInstanceOf(AuthUnknown)

    const off = await makeEmailAuthFixture({ password: false })
    const offAccount = await off.pinSignIn('off-switch@example.org')
    expect(await failure(off.service.setDevicePin({ enabled: false }, off.session(offAccount.accountId))))
      .toBeInstanceOf(EmailPasswordDisabled)
  })

  test('a password change keeps the choice; removing the password drops it', async () => {
    const { env, accountId, session } = await withPassword()
    const { challenge } = await env.service.setDevicePin({ enabled: false }, session)
    await env.service.setDevicePin({ enabled: false, challenge, pin: env.codeOf() }, session)

    const change = await env.service.confirmPin({ purpose: EmailPasswordPurpose.Change }, session)
    const changed = await env.service.setPassword({ password: 'a new password', challenge: change.challenge, pin: env.codeOf() }, session)
    expect(changed.devicePin).toBe(false)
    expect(await env.service.decline(session)).toMatchObject({ set: true, devicePin: false })

    const remove = await env.service.confirmPin({ purpose: EmailPasswordPurpose.Remove }, session)
    const removed = await env.service.removePassword({ challenge: remove.challenge, pin: env.codeOf() }, session)
    expect(removed).toMatchObject({ set: false, devicePin: true })
    expect((await env.passwords().load({ accountId }))!.devicePin).toBeUndefined()
  })
})
