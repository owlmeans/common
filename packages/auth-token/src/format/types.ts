/** An `Authorization` header taken apart: the scheme lower-cased, the value trimmed. */
export interface AuthorizationHeader {
  scheme: string
  value: string
}

/** How an access token is recognised on the wire and shown back to a person. */
export interface TokenFormatHelper {
  /**
   * Split an `Authorization` header into its scheme and its value.
   *
   * Deliberately NOT `extractAuthToken` from `@owlmeans/auth-common`: that compares the prefix
   * against `type.toUpperCase()`, so it matches `AUTH-TOKEN` and can never match `Bearer` — the
   * exact spelling every third-party client sends. The scheme comes back lower-cased so a caller
   * compares once.
   */
  parseAuthorizationHeader: (header: string | string[] | undefined) => AuthorizationHeader | null
  /** Whether a value looks like an access token this deployment issued. */
  isAccessToken: (value: string | null | undefined, prefix: string) => boolean
  /**
   * The half of a token that may be shown again.
   *
   * Prefix plus the first characters of the secret. Enough to tell two tokens apart in a list, and
   * far short of anything that could be replayed.
   */
  displayOf: (token: string, prefix: string) => string
}
