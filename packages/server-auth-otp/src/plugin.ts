import { ALL_SCOPES, AuthenFailed, AuthRole, AuthenticationType } from '@owlmeans/auth'
import type { AuthPlugin } from '@owlmeans/server-auth/manager/plugins'
import { registerPlugin } from '@owlmeans/server-auth/manager/plugins'
import type { OtpService } from '@owlmeans/auth-otp'
import { OTP_AUTH_TYPE, OTP_SERVICE } from '@owlmeans/auth-otp'
import type { IdentityLinkingService } from '@owlmeans/server-auth-identity'
import { AUTH_IDENTITY_LINKING } from '@owlmeans/server-auth-identity'
import type { OtpConfig, OtpContext } from './types.js'

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
    // Store the email in the challenge so the envelope preserves it for authenticate.
    return { challenge: email }
  },

  authenticate: async credential => {
    // credential.challenge is the email (opened from the signed envelope in makeAuthModel).
    const email = credential.challenge
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
