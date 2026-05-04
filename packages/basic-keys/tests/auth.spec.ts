import { describe, expect, test } from 'bun:test'
import { packAuthCredentials, unpackAuthCredentials } from '@owlmeans/basic-keys'
import { AuthRole, AuthenticationType } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'
import { fixtureKey } from './context.js'

const baseCreds = (): Omit<AuthCredentials, 'credential'> => ({
  type: AuthenticationType.BasicEd25519,
  role: AuthRole.User,
  userId: 'user-1',
  challenge: 'challenge-string',
  scopes: ['*'],
})

describe('@owlmeans/basic-keys — packAuthCredentials round-trip', () => {
  test('signs and verifies credentials with extras attached', async () => {
    const key = fixtureKey()
    const signed = await packAuthCredentials(baseCreds(), { nonce: 'n-1' }, key)
    const result = await unpackAuthCredentials<{ nonce: string }>(signed, key)
    expect(result.isValid).toBe(true)
    expect(result.extras?.nonce).toBe('n-1')
  })

  test('verification fails for a different keypair', async () => {
    const signing = fixtureKey('alice')
    const other = fixtureKey('bob')
    const signed = await packAuthCredentials(baseCreds(), { nonce: 'n-1' }, signing)
    const result = await unpackAuthCredentials(signed, other)
    expect(result.isValid).toBe(false)
  })
})
