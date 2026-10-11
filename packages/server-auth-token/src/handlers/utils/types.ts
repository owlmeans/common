import type { AccessTokenRecord, AccessTokenView } from '@owlmeans/auth-token'
import type { AccessTokenResource, AuthTokenContext } from '../../types.js'

/** What every token handler shares: the store and the view a caller may see. */
export interface TokenRecordUtils {
  /** A record without its hash — the hash never leaves the server. */
  view: (record: AccessTokenRecord) => AccessTokenView
  /** The token store of a context. */
  tokens: (ctx: AuthTokenContext) => AccessTokenResource
}
