import type { AccessTokenView } from '@owlmeans/auth-token'
import type { AccessTokenStatus } from '../types.js'

/** How a token row reads: its badge and its moments. */
export interface AccessTokenViewHelper {
  /**
   * What a token's badge says.
   *
   * Revocation outranks expiry: a token revoked before its lifetime ran out is revoked, and saying
   * "expired" about it would suggest it could be renewed. Both outrank `active`, which is what is
   * left when neither happened.
   */
  tokenStatus: (item: AccessTokenView) => AccessTokenStatus
  /**
   * One of a record's moments, in the reader's own language, or null when there is none.
   *
   * Null is the caller's cue to render its own copy — `never` for a token without an expiry,
   * `never-used` for one nothing has presented yet — because an empty cell says neither.
   */
  formatMoment: (value: Date | string | null | undefined, lng?: string) => string | null
}
