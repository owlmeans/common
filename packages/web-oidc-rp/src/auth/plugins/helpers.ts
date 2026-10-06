import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { AUTH_SCOPE, AuthRole } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'
import type { GoogleClientHelper } from './helpers/types.js'

export const createGoogleClientHelper = (): GoogleClientHelper => {
  const extractGoogleUrl = (envelopeChallenge: string, sourcePrefix: string): string => {
    const envelope = makeEnvelopeModel(envelopeChallenge, EnvelopeKind.Wrap)
    const msg = envelope.message<string>(true)

    if (msg.startsWith(sourcePrefix + ':')) {
      return msg.slice(sourcePrefix.length + 1)
    }
    return msg
  }

  const buildCallbackCredentials = (
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

  return { extractGoogleUrl, buildCallbackCredentials }
}

export const googleClientHelper = createGoogleClientHelper()
