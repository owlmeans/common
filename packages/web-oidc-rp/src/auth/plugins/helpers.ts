/**
 * Pure helpers extracted from the Google client plugin for unit-testability.
 * These perform the URL/challenge processing logic that doesn't depend on React.
 */

import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { AUTH_SCOPE, AuthRole } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'

/**
 * Extract the Google auth URL from a signed challenge envelope message.
 * The server wraps the challenge as "source:googleUrl" — this strips the source prefix.
 * Also handles raw Google URLs (rolling deployment compatibility).
 */
export const extractGoogleUrl = (envelopeChallenge: string, sourcePrefix: string): string => {
  const envelope = makeEnvelopeModel(envelopeChallenge, EnvelopeKind.Wrap)
  const msg = envelope.message<string>(true)

  if (msg.startsWith(sourcePrefix + ':')) {
    return msg.slice(sourcePrefix.length + 1)
  }
  return msg
}

/**
 * Build AuthCredentials from the Google callback URL query params.
 */
export const buildCallbackCredentials = (
  queryString: string,
  type: string,
  challenge: string,
): AuthCredentials => ({
  type,
  challenge,
  credential: queryString,
  role: AuthRole.User,
  userId: 'code',
  scopes: [AUTH_SCOPE],
})
