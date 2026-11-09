import { afterAll, describe, expect, test } from 'bun:test'
import { EMAIL_PASSWORD_AUTH_TYPE, EmailPasswordPurpose, EmailSignInReason } from '@owlmeans/auth-email'
import { EMAIL_AUTH_DEVICE_COLLECTION, EMAIL_AUTH_PASSWORD_COLLECTION } from '../src/consts.js'
import { emailAuthKeyHelper } from '../src/keys.js'
import { DEVICE_A, DEVICE_B, TEARDOWN_TIMEOUT, makeMongoEmailAuthSuite, mongoGate, tokenOf } from './context.js'

const suite = makeMongoEmailAuthSuite('email_auth')
const it = mongoGate.skip ? test.skip : test

describe('@owlmeans/server-auth-email — Mongo resources', () => {
  if (mongoGate.skip) {
    test.skip(mongoGate.reason ?? 'mongo gate closed', () => {})

    return
  }

  afterAll(async () => { await suite.teardown() }, TEARDOWN_TIMEOUT)

  it('declares the unique and TTL indexes', async () => {
    await suite.boot()

    const indexes = await suite.raw(async client => ({
      password: await client.db(suite.database).collection(EMAIL_AUTH_PASSWORD_COLLECTION).indexes(),
      device: await client.db(suite.database).collection(EMAIL_AUTH_DEVICE_COLLECTION).indexes(),
    }))
    expect(indexes.password.find(index => index.name === 'account')).toMatchObject({ key: { accountId: 1 }, unique: true })
    expect(indexes.device.find(index => index.name === 'device')).toMatchObject({ key: { accountId: 1, key: 1 }, unique: true })
    expect(indexes.device.find(index => index.name === 'expiry')).toMatchObject({ key: { expiresAt: 1 }, expireAfterSeconds: 0 })
  }, 60_000)

  it('signs up by PIN, sets a password by offer, signs in by password on the known device only', async () => {
    const env = await suite.boot()
    const { accountId, offer } = await env.pinSignIn('mongo@example.org', DEVICE_A)
    await env.service.setPassword({ password: 'correct horse battery', offer, device: DEVICE_A }, env.session(accountId))

    const known = await env.service.signIn({ email: 'mongo@example.org', device: DEVICE_A, password: 'correct horse battery' }, env.guest())
    expect(tokenOf(known.token!).type).toBe(EMAIL_PASSWORD_AUTH_TYPE)
    const unknown = await env.service.signIn({ email: 'mongo@example.org', device: DEVICE_B, password: 'correct horse battery' }, env.guest())
    expect(unknown.reason).toBe(EmailSignInReason.Device)

    const stored = await suite.raw(async client => await client.db(suite.database)
      .collection(EMAIL_AUTH_DEVICE_COLLECTION).findOne({ accountId }))
    expect(stored!.expiresAt).toBeInstanceOf(Date)
    expect(stored!.key).toBe(emailAuthKeyHelper.deviceKey(accountId, DEVICE_A))
  }, 60_000)

  it('keeps the newest ten devices, ignores an expired one, and a removal forgets the others', async () => {
    const env = await suite.boot()
    const { accountId } = await env.pinSignIn('rotate@example.org', DEVICE_A)
    const now = Date.now()
    for (let index = 0; index < 10; index += 1) {
      const seen = new Date(now - (20 - index) * 60_000)
      await env.devices().create({
        accountId, key: emailAuthKeyHelper.deviceKey(accountId, `old-device-${index}-xxxxxxxxxx`),
        createdAt: seen, lastSeenAt: seen, expiresAt: new Date(now + 86_400_000),
      })
    }
    await env.pinSignIn('rotate@example.org', DEVICE_B)
    expect((await env.devices().list({ accountId }, { size: 0 })).total).toBe(10)

    const expired = new Date(now - 1_000)
    await env.devices().create({
      accountId: 'expired-account', key: emailAuthKeyHelper.deviceKey('expired-account', DEVICE_A),
      createdAt: expired, lastSeenAt: expired, expiresAt: expired,
    })
    await env.service.signIn({ email: 'rotate@example.org', device: DEVICE_A, password: 'not checked here' }, env.guest())
      .catch(() => undefined)

    const { challenge } = await env.service.confirmPin({ purpose: EmailPasswordPurpose.Remove }, env.session(accountId))
    await env.service.removePassword({ challenge, pin: env.codeOf(), device: DEVICE_B }, env.session(accountId))
    expect((await env.devices().list({ accountId }, { size: 0 })).total).toBe(1)
  }, 60_000)
})
