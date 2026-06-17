import { describe, expect, test } from 'bun:test'
import {
  EnvelopeKind,
  makeEnvelopeModel,
} from '@owlmeans/basic-envelope'
import { makeFixtureKeyPair } from '@owlmeans/test-auth'

const ENVELOPE_TYPE = 'ed25519-basic-token'

describe('@owlmeans/basic-envelope — sign/verify round-trip', () => {
  // The Ed25519 path of the auth protocol wraps an Auth payload in an envelope
  // signed with the issuing service's keypair (see auth-protocol skill). The
  // verifier holds only the public key (loaded via TRUSTED resource) — exactly
  // what `fromPubKey(...)` produces for trusted records in viable backends.
  test('a token-kind envelope verifies with the same keypair', async () => {
    const key = makeFixtureKeyPair('envelope-spec')
    const env = makeEnvelopeModel<{ userId: string }>(ENVELOPE_TYPE)
    env.send({ userId: 'u-1' })
    await env.sign(key, EnvelopeKind.Token)

    expect(await env.verify(key)).toBe(true)
  })

  test('verification fails when the envelope was signed by a different key', async () => {
    const signing = makeFixtureKeyPair('alice-env')
    const other = makeFixtureKeyPair('bob-env')
    const env = makeEnvelopeModel<{ userId: string }>(ENVELOPE_TYPE)
    env.send({ userId: 'u-2' })
    await env.sign(signing, EnvelopeKind.Token)

    expect(await env.verify(other)).toBe(false)
  })

  test('tokenize() round-trips through makeEnvelopeModel(tokenized, EnvelopeKind.Token)', async () => {
    const key = makeFixtureKeyPair('roundtrip-env')
    const original = makeEnvelopeModel<{ userId: string }>(ENVELOPE_TYPE)
    original.send({ userId: 'u-3' })
    const token = await original.sign(key, EnvelopeKind.Token)

    const reopened = makeEnvelopeModel<{ userId: string }>(token, EnvelopeKind.Token)
    expect(reopened.type()).toBe(ENVELOPE_TYPE)
    expect(reopened.message<{ userId: string }>().userId).toBe('u-3')
    expect(await reopened.verify(key)).toBe(true)
  })

  test('verify returns false once the ttl has elapsed', async () => {
    const key = makeFixtureKeyPair('ttl-env')
    const env = makeEnvelopeModel<{ userId: string }>(ENVELOPE_TYPE)
    env.send({ userId: 'u-4' }, 1) // 1ms ttl — already in the past after sign()
    await env.sign(key, EnvelopeKind.Token)
    await new Promise(r => setTimeout(r, 5))

    expect(await env.verify(key)).toBe(false)
  })
})
