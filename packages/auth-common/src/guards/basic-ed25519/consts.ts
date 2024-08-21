import { AuthroizationType } from '@owlmeans/auth'

export const GUARD_ED25519 = `guard:${AuthroizationType.Ed25519BasicSignature}`

export const BED255_TIME_HEADER = 'X-Auth-Time'
export const BED255_NONCE_HEADER = 'X-Auth-Nonce'

export const BED255_SIG_TTL = 60 * 1000

export const BED255_CASHE_RESOURCE = 'basic-ed25519-nonce-cache'
