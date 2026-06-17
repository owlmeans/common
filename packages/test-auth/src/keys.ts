import { makeKeyPairModel } from '@owlmeans/basic-keys'
import type { KeyPairModel } from '@owlmeans/basic-keys'
import { createHash } from 'node:crypto'

const encodeBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64')

/**
 * Deterministic Ed25519 keypair derived from `seed`. Same seed → same keys.
 * Use in tests to keep signatures and trust-records stable across runs.
 *
 * Calling without a seed returns a fresh random keypair (re-uses
 * `makeKeyPairModel()` semantics).
 */
export const makeFixtureKeyPair = (seed?: string): KeyPairModel => {
  if (seed == null) return makeKeyPairModel()
  const primary = createHash('sha256')
    .update(`@owlmeans/test-auth:${seed}`)
    .digest()
  return makeKeyPairModel(`ed25519:${encodeBase64(primary)}`)
}
