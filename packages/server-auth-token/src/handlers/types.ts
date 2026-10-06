import { AuthRole } from '@owlmeans/auth'
import type { CreateAccessToken, IssuedAccessToken } from '@owlmeans/auth-token'

/** Whoever is minting the token — read once, by whichever caller resolved the session. */
export interface IssueAccessTokenSubject {
  entityId: string
  userId: string
  profileId: string
  role: AuthRole
  /** The subject's OWN scopes — minting can only narrow, never widen, this set. */
  scopes: string[]
}

export interface IssueAccessTokenRequest extends CreateAccessToken {
  /**
   * The resource(s) this token is FOR (RFC 8707), when it is minted through an OAuth grant.
   * Absent for a token minted by hand — the ordinary, unrestricted kind.
   */
  audience?: string[]
}

/** Token issuance over one context's store — the one path every minting caller goes through. */
export interface AccessTokenIssuer {
  /**
   * Mint one token for `subject`, exactly what `createAccessToken` does over an HTTP body — pulled
   * out so a second caller (an OAuth token endpoint) can mint the SAME shape of record over a
   * session it authenticated its own way, without a duplicate copy of the narrowing rule or the
   * TTL clamp silently drifting from this one.
   */
  issueAccessToken: (subject: IssueAccessTokenSubject, payload: IssueAccessTokenRequest) => Promise<IssuedAccessToken>
}
