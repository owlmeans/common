import { randomBytes } from '@noble/hashes/utils.js'
import { base64urlnopad } from '@scure/base'
import { sha256 } from '@noble/hashes/sha2.js'
import { OAUTH_CODE_VERIFIER_MAX } from './consts.js'
import type { PkcePair } from './types.js'
import type { PkceHelper } from './pkce/types.js'

export const createPkceHelper = (): PkceHelper => {
  const createPkcePair = (): PkcePair => {
    const verifier = base64urlnopad.encode(randomBytes(Math.floor(OAUTH_CODE_VERIFIER_MAX * 3 / 4)))
      .slice(0, OAUTH_CODE_VERIFIER_MAX)

    return { verifier, challenge: challengeFor(verifier) }
  }

  const challengeFor = (verifier: string): string =>
    base64urlnopad.encode(sha256(new TextEncoder().encode(verifier)))

  const verifyPkce = (verifier: string, challenge: string): boolean =>
    challengeFor(verifier) === challenge

  return { createPkcePair, challengeFor, verifyPkce }
}

export const pkceHelper = createPkceHelper()
