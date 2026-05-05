import { describe, expect, test } from 'bun:test'
import { fromPubKey, makeKeyPairModel, matchAddress } from '@owlmeans/basic-keys'
import { fixtureKey } from './context.js'

describe('@owlmeans/basic-keys — KeyPairModel sign/verify', () => {
  // viable-agent/packages/template/packages/backend/src/owlmeans.ts:63 builds a key
  // via `makeKeyPairModel(process.env.TRUSTED_PK)` and signs/verifies through it.
  test('round-trips a signature with the same keypair', async () => {
    const key = fixtureKey('keys-spec')
    const sig = await key.sign({ payload: 'hello' })
    expect(await key.verify({ payload: 'hello' }, sig)).toBe(true)
  })

  test('verification fails when the payload is tampered', async () => {
    const key = fixtureKey('keys-spec')
    const sig = await key.sign({ payload: 'hello' })
    expect(await key.verify({ payload: 'goodbye' }, sig)).toBe(false)
  })
})

describe('@owlmeans/basic-keys — public-key-only verification (fromPubKey)', () => {
  // Mirrors viable/sources/backend/src/config.ts which loads peer public keys
  // (`master-pub`, `auth-pub`, etc.) into trusted records — the reading service
  // never holds the private key but must still verify those peers' signatures.
  test('fromPubKey produces a model that verifies signatures from the original key', async () => {
    const signing = fixtureKey('peer-keys-spec')
    const sig = await signing.sign({ event: 'check' })

    const verifying = fromPubKey(signing.exportPublic())
    expect(await verifying.verify({ event: 'check' }, sig)).toBe(true)
  })

  test('matchAddress agrees with exportAddress() on the same keypair', () => {
    const key = fixtureKey('addr-spec')
    expect(matchAddress(key.exportAddress(), key.exportPublic())).toBe(true)
  })

  test('export() round-trips into a new model that produces the same public key', async () => {
    const key = fixtureKey('export-spec')
    const reimported = makeKeyPairModel(key.export())
    expect(reimported.exportPublic()).toBe(key.exportPublic())
    expect(reimported.exportAddress()).toBe(key.exportAddress())
  })
})
