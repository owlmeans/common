import { authToken } from '@owlmeans/auth-token'
import type { AccessTokensAliases } from '../types.js'

/** The aliases `makeAuthTokenEntrypoints` declares, which is what an unconfigured host mounts. */
export const DEFAULT_ALIASES: AccessTokensAliases = {
  list: authToken.list,
  create: authToken.create,
  revoke: authToken.revoke,
}
