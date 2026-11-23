import { AuthroizationType } from '@owlmeans/auth'

export const GUARD_ED25519 = `guard:${AuthroizationType.Ed25519BasicSignature}`

export const BED255_TIME_HEADER = 'X-Auth-Time'
export const BED255_NONCE_HEADER = 'X-Auth-Nonce'

export const BED255_SIG_TTL = 60 * 1000

/**
 * How long a nonce claimed by a QUEUED request (one that carries `delivery`) stays bound to its job:
 * the broker's own redelivery of that job (a stall, a retry) is admitted on that claim — past the
 * signature's window too — for this long after the first admission.
 */
export const BED255_DELIVERY_TTL = 60 * 60 * 1000

export const BED255_CASHE_RESOURCE = 'basic-ed25519-nonce-cache'
