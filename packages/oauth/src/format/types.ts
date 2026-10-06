/** The formats of the opaque values an OAuth exchange carries: secrets, user codes, redirect URIs. */
export interface OAuthFormatHelper {
  /** A high-entropy opaque secret — a device code or an authorization code. Never shown to a
   * person; the client that receives one hands it back verbatim, once. */
  createOpaqueSecret: (bytes?: number) => string
  /** What a server stores and looks an opaque secret up by — never the plaintext itself. Both a
   * device code and an authorization code are hashed this same way, for the same reason an access
   * token is: a stolen database row must not itself be usable as a credential. */
  hashOAuthSecret: (secret: string) => string
  /** The high-entropy secret a client polls with. Never shown to a person. */
  createDeviceCode: () => string
  /** What a server stores and looks a device code up by — never the plaintext itself. */
  hashDeviceCode: (deviceCode: string) => string
  /**
   * A short code a person types, or that rides a QR/URL as `verification_uri_complete`.
   *
   * RFC 8628 §6.1's alphabet drops characters that are easy to misread (`0`/`O`, `1`/`I`) and
   * vowels (so no accidental word forms). Rendered `XXXX-XXXX`.
   */
  createUserCode: () => string
  /** Normalize what a person typed: upper-case, and tolerate a missing or extra dash. */
  normalizeUserCode: (input: string) => string
  /** The hostname of a URL, or `null` for a value that does not parse — never throws. */
  hostOf: (url: string) => string | null
  isLoopbackHost: (host: string | null) => boolean
  /**
   * Whether `candidate` matches `registered` under loopback port-agnostic matching (RFC 8252 §7.3,
   * carried into the MCP client-registration guidance): same scheme, same loopback host, same path
   * and query, any port. Every other pair must match byte for byte.
   */
  matchesRedirectUri: (registered: string, candidate: string) => boolean
}
