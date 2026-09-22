import { ALL_SCOPES, AuthenFailed, AuthRole, AuthenticationType } from '@owlmeans/auth'
import type { AuthPlugin } from '@owlmeans/server-auth/manager/plugins'
import { AuthChallengeReplayPolicy, registerPlugin } from '@owlmeans/server-auth/manager/plugins'
import type { OtpService } from '@owlmeans/auth-otp'
import { OTP_AUTH_TYPE, OTP_SERVICE } from '@owlmeans/auth-otp'
import type { IdentityLinkingService } from '@owlmeans/server-auth-identity'
import { AUTH_IDENTITY_LINKING } from '@owlmeans/server-auth-identity'
import type { OtpConfig, OtpContext } from './types.js'

// Separates the email from the opaque issuance id inside the signed challenge.
const CHALLENGE_DELIMITER = '::'

/** Factory that creates the email-OTP AuthPlugin bound to the given context. */
const otpPlugin = <C extends OtpConfig, T extends OtpContext<C>>(context: T): AuthPlugin => ({
  type: OTP_AUTH_TYPE,
  challengeReplayPolicy: AuthChallengeReplayPolicy.Plugin,

  init: async request => {
    if (request.userId == null || !request.userId.includes('@')) {
      throw new AuthenFailed('otp:email')
    }
    const email = request.userId.trim().toLowerCase()
    const otp = context.service<OtpService>(OTP_SERVICE)
    const issuanceId = await otp.issueChallenge(email)
    return { challenge: `${email}${CHALLENGE_DELIMITER}${issuanceId}` }
  },

  authenticate: async credential => {
    // credential.challenge is "email::issuanceId" (opened from the signed envelope).
    const parts = credential.challenge?.split(CHALLENGE_DELIMITER) ?? []
    const email = parts.length === 2 ? parts[0] : undefined
    const issuanceId = parts.length === 2 ? parts[1] : undefined
    const code = credential.credential

    if (!email || !email.includes('@') || !issuanceId) {
      throw new AuthenFailed('otp:email')
    }
    if (!code) {
      throw new AuthenFailed('otp:code')
    }

    const otp = context.service<OtpService>(OTP_SERVICE)
    await otp.verifyChallenge(email, issuanceId, code)

    const identityAlias = (context.cfg as any).otp?.identityAlias ?? AUTH_IDENTITY_LINKING
    const identity = context.service<IdentityLinkingService>(identityAlias)

    // What arrives on the credential is the organization SLUG the user is logging into — it is
    // what a person can be asked to type. The linked profile below answers with the canonical
    // slug, which is what the token ends up carrying.
    const entitySlug = credential.entitySlug
    const details = {
      type: OTP_AUTH_TYPE,
      service: 'email',
      clientId: entitySlug ?? 'default',
      userId: email,
      entityId: entitySlug,
    }

    let payload = await identity.getLinkedProfile(details)
    if (payload == null) {
      payload = await identity.linkProfile(details, { username: email })
    }

    // Set the resulting credential fields for the envelope.
    credential.type = AuthenticationType.OneTimeToken
    credential.userId = payload.userId
    credential.profileId = payload.profileId
    credential.entitySlug = payload.entitySlug
    credential.role = payload.role ?? AuthRole.User
    credential.scopes = payload.scopes ?? [ALL_SCOPES]

    return { token: '' }
  },
})

/** Register the email-OTP plugin into the server-auth plugin registry. Call once at context setup. */
export const appendOtpPlugin = <C extends OtpConfig, T extends OtpContext<C>>(context: T): T => {
  registerPlugin(OTP_AUTH_TYPE, otpPlugin as Parameters<typeof registerPlugin>[1])
  return context
}
