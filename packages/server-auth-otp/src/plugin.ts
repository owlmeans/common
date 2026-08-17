import { ALL_SCOPES, AuthenFailed, AuthRole, AuthenticationType } from '@owlmeans/auth'
import type { AuthPlugin } from '@owlmeans/server-auth/manager/plugins'
import { registerPlugin } from '@owlmeans/server-auth/manager/plugins'
import type { OtpService } from '@owlmeans/auth-otp'
import { OTP_AUTH_TYPE, OTP_SERVICE } from '@owlmeans/auth-otp'
import type { IdentityLinkingService } from '@owlmeans/server-auth-identity'
import { AUTH_IDENTITY_LINKING } from '@owlmeans/server-auth-identity'
import { createIdOfLength, IdStyle } from '@owlmeans/basic-ids'
import type { OtpConfig, OtpContext } from './types.js'

// Separates the email from the per-request nonce inside the challenge (see init() below).
const CHALLENGE_DELIMITER = '::'

/** Factory that creates the email-OTP AuthPlugin bound to the given context. */
const otpPlugin = <C extends OtpConfig, T extends OtpContext<C>>(context: T): AuthPlugin => ({
  type: OTP_AUTH_TYPE,

  init: async request => {
    if (request.userId == null || !request.userId.includes('@')) {
      throw new AuthenFailed('otp:email')
    }
    const email = request.userId.trim().toLowerCase()
    const otp = context.service<OtpService>(OTP_SERVICE)
    await otp.issueChallenge(email)
    // The auth manager's anti-replay cache (AUTH_CACHE) keys on this decoded challenge, so it
    // must be unique per request — the plaintext email alone would be identical across every
    // independent login attempt for that address and collide with a still-cached prior one.
    const nonce = createIdOfLength(16, IdStyle.Base58)
    return { challenge: `${email}${CHALLENGE_DELIMITER}${nonce}` }
  },

  authenticate: async credential => {
    // credential.challenge is "email::nonce" (opened from the signed envelope in makeAuthModel).
    const email = credential.challenge?.split(CHALLENGE_DELIMITER)[0]
    const code = credential.credential

    if (!email || !email.includes('@')) {
      throw new AuthenFailed('otp:email')
    }
    if (!code) {
      throw new AuthenFailed('otp:code')
    }

    const otp = context.service<OtpService>(OTP_SERVICE)
    await otp.verifyChallenge(email, code)

    const identityAlias = (context.cfg as any).otp?.identityAlias ?? AUTH_IDENTITY_LINKING
    const identity = context.service<IdentityLinkingService>(identityAlias)

    const entityId = credential.entityId
    const details = {
      type: OTP_AUTH_TYPE,
      service: 'email',
      clientId: entityId ?? 'default',
      userId: email,
      entityId,
    }

    let payload = await identity.getLinkedProfile(details)
    if (payload == null) {
      payload = await identity.linkProfile(details, { username: email })
    }

    // Set the resulting credential fields for the envelope.
    credential.type = AuthenticationType.OneTimeToken
    credential.userId = payload.userId
    credential.profileId = payload.profileId
    credential.entityId = payload.entityId
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
