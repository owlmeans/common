import { AuthroizationType } from '@owlmeans/auth'

export const TRUSTED_DEFAULT_ALIAS = 'TRUSTED'

/** The fields a `trust()` lookup keys on — the only index this map has. */
export const SUPPORTED_FIELDS = ['id', 'name']

/** The scheme word of an `Authorization` header carrying an Ed25519 basic token. */
export const AUTH_BEARER_PREFIX = AuthroizationType.Ed25519BasicToken.toUpperCase()
