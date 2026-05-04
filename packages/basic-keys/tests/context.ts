import { makeFixtureKeyPair } from '@owlmeans/test-auth'
import type { KeyPairModel } from '@owlmeans/basic-keys'

/**
 * Per-suite fixture: deterministic Ed25519 keypair from `@owlmeans/test-auth`.
 * Category-B packages reuse the same fixture across specs so signatures
 * stay stable run-to-run.
 */
export const fixtureKey = (seed: string = 'basic-keys-pilot'): KeyPairModel =>
  makeFixtureKeyPair(seed)
