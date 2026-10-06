import type { AuthCredentials } from '@owlmeans/auth'

/**
 * Pure helpers extracted from the Google client plugin for unit-testability.
 * These perform the URL/challenge processing logic that doesn't depend on React.
 */
export interface GoogleClientHelper {
  /**
   * Extract the Google auth URL from a signed challenge envelope message.
   * The server wraps the challenge as "source:googleUrl" — this strips the source prefix.
   * Also handles raw Google URLs (rolling deployment compatibility).
   */
  extractGoogleUrl: (envelopeChallenge: string, sourcePrefix: string) => string
  /** Build AuthCredentials from the Google callback URL query params. */
  buildCallbackCredentials: (queryString: string, type: string, challenge: string) => AuthCredentials
}
