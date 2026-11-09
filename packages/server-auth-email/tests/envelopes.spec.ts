import { describe, expect, test } from 'bun:test'
import { EMAIL_CONFIRM_ENVELOPE, EMAIL_PIN_AUTH_TYPE, EMAIL_WAIVER_ENVELOPE, EmailPasswordPurpose } from '@owlmeans/auth-email'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { makeFixtureKeyPair } from '@owlmeans/test-auth'
import { emailEnvelopesOf } from '../src/envelopes.js'
import { makeEmailAuthFixture } from './context.js'

const CLAIM = { purpose: EmailPasswordPurpose.Change, accountId: 'acc-1', email: 'a::b@example.org', issuanceId: 'issuance-1' }

describe('@owlmeans/server-auth-email — envelopes', () => {
  test('a confirmation round-trips; it opens as a pending PIN; a sign-in challenge is no confirmation', async () => {
    const env = await makeEmailAuthFixture()
    const envelopes = emailEnvelopesOf(env.context)

    const challenge = await envelopes.signConfirm(CLAIM)
    expect(await envelopes.openConfirm(challenge)).toEqual(CLAIM)
    expect(await envelopes.openPending(challenge)).toEqual({ email: CLAIM.email, issuanceId: CLAIM.issuanceId })

    const pin = await env.challengeOf(EMAIL_PIN_AUTH_TYPE, 'person@example.org::issuance-2')
    expect(await envelopes.openPending(pin)).toEqual({ email: 'person@example.org', issuanceId: 'issuance-2' })
    expect(await envelopes.openConfirm(pin)).toBeNull()
  })

  test('another signer, another type, an unknown purpose, a longer life or garbage open as nothing', async () => {
    const env = await makeEmailAuthFixture()
    const envelopes = emailEnvelopesOf(env.context)
    const message = 'change::acc-1::a@example.org::issuance-1'

    const forged = await makeEnvelopeModel<string>(EMAIL_CONFIRM_ENVELOPE).send(message, 60_000)
      .sign(makeFixtureKeyPair('someone-else'), EnvelopeKind.Wrap)
    const otherType = await env.challengeOf('email-otp', message)
    const badPurpose = await makeEnvelopeModel<string>(EMAIL_CONFIRM_ENVELOPE).send('admin::acc-1::a@example.org::i', 60_000)
      .sign(env.authKey, EnvelopeKind.Wrap)
    const tooLong = await makeEnvelopeModel<string>(EMAIL_CONFIRM_ENVELOPE).send(message, 24 * 3600_000)
      .sign(env.authKey, EnvelopeKind.Wrap)
    const expired = makeEnvelopeModel<string>(EMAIL_CONFIRM_ENVELOPE).send(message, 60_000)
    expired.envelope.dt -= 120_000
    const stale = await expired.sign(env.authKey, EnvelopeKind.Wrap)

    for (const challenge of [forged, otherType, badPurpose, tooLong, stale, 'garbage', '']) {
      expect(await envelopes.openConfirm(challenge)).toBeNull()
    }
    expect(await envelopes.openPending('garbage')).toBeNull()
  })

  test('a waiver verifies only as itself', async () => {
    const env = await makeEmailAuthFixture()
    const envelopes = emailEnvelopesOf(env.context)

    const { waiver } = await envelopes.signWaiver()
    expect(await envelopes.verifyWaiver(waiver)).toBe(true)

    const unmarked = await makeEnvelopeModel<string>(EMAIL_WAIVER_ENVELOPE).send('something else', 60_000)
      .sign(env.authKey, EnvelopeKind.Token)
    const forged = await makeEnvelopeModel<string>(EMAIL_WAIVER_ENVELOPE).send('email-waiver:x', 60_000)
      .sign(makeFixtureKeyPair('someone-else'), EnvelopeKind.Token)
    const asWrap = await makeEnvelopeModel<string>(EMAIL_WAIVER_ENVELOPE).send('email-waiver:x', 60_000)
      .sign(env.authKey, EnvelopeKind.Wrap)
    for (const value of [unmarked, forged, asWrap, 'garbage']) {
      expect(await envelopes.verifyWaiver(value)).toBe(false)
    }
  })
})
