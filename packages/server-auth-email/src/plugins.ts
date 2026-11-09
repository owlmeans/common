import { randomBytes } from 'node:crypto'
import { ALL_SCOPES, AuthenFailed, AuthRole } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'
import { EMAIL_IDENTITY_TYPE, EMAIL_PASSWORD_AUTH_TYPE, EMAIL_PIN_AUTH_TYPE } from '@owlmeans/auth-email'
import type { OtpService } from '@owlmeans/auth-otp'
import type { ProviderProfileDetails } from '@owlmeans/oidc'
import { AuthChallengeReplayPolicy, authPluginHelper } from '@owlmeans/server-auth/manager/plugins'
import type { AuthPlugin, AuthPluginFactory } from '@owlmeans/server-auth/manager/plugins'
import type { IdentityLinkingService } from '@owlmeans/server-auth-identity'
import { ABSENT_PASSWORD_HASH, CHALLENGE_DELIMITER, PASSWORD_CHALLENGE_BYTES } from './consts.local.js'
import { passwordHasher } from './hasher.js'
import { emailAuthKeyHelper } from './keys.js'
import type { EmailAuthContext } from './types.js'
import type { EmailAuthPlugins, EmailPluginScope, EmailPluginSetup } from './plugins/types.js'

export const makeEmailAuthPlugins = (ctx: EmailAuthContext, setup: EmailPluginSetup): EmailAuthPlugins => {
  const otp = (): OtpService => ctx.service<OtpService>(setup.otpAlias)

  /**
   * The account behind the verified address, through the linking service — the e-mail credential of
   * one account per address. Then the credential is STAMPED with this plugin's own type and the
   * identity's fields: whatever the caller sent is overwritten.
   */
  const signIn = async (
    credential: AuthCredentials, type: string, email: string, scope: EmailPluginScope, accountId?: string
  ): Promise<void> => {
    const identity = ctx.service<IdentityLinkingService>(setup.identityAlias)
    const details: ProviderProfileDetails = { type: EMAIL_IDENTITY_TYPE, service: 'email', clientId: 'default', userId: email }
    const payload = await identity.getLinkedProfile(details) ?? await identity.linkProfile(details, { username: email })
    if (accountId != null && payload.userId !== accountId) {
      // The password was verified for one account; a token for another is never signed.
      throw new AuthenFailed('email:password')
    }
    scope.onLinked?.(payload)

    credential.type = type
    credential.userId = payload.userId
    credential.profileId = payload.profileId
    credential.entitySlug = payload.entitySlug
    credential.role = payload.role ?? AuthRole.User
    credential.scopes = payload.scopes ?? [ALL_SCOPES]
  }

  const pinPlugin = (scope: EmailPluginScope): AuthPluginFactory => () => {
    const plugin: AuthPlugin = {
      type: EMAIL_PIN_AUTH_TYPE,
      // The OTP store counts the attempts and consumes the issuance atomically.
      challengeReplayPolicy: AuthChallengeReplayPolicy.Plugin,

      init: async request => {
        authPluginHelper.assertType(request.type, plugin)
        const email = emailAuthKeyHelper.normalizeEmail(request.userId ?? '')
        if (!email.includes('@')) {
          throw new AuthenFailed('email:address')
        }
        const issuanceId = await otp().issueChallenge(email, { message: scope.message })

        return { challenge: `${email}${CHALLENGE_DELIMITER}${issuanceId}` }
      },

      authenticate: async credential => {
        authPluginHelper.assertType(credential.type, plugin)
        // `email::issuanceId`, opened from the signed challenge by the model.
        const parts = (credential.challenge ?? '').split(CHALLENGE_DELIMITER)
        const issuanceId = parts.pop() ?? ''
        const email = parts.join(CHALLENGE_DELIMITER)
        if (!email.includes('@') || issuanceId === ''
          || emailAuthKeyHelper.normalizeEmail(credential.userId ?? '') !== email) {
          throw new AuthenFailed('email:challenge')
        }
        if (credential.credential == null || credential.credential === '') {
          throw new AuthenFailed('email:pin')
        }
        const spend = emailAuthKeyHelper.spendKey(credential.challenge ?? '')
        await otp().verifyChallenge(email, issuanceId, credential.credential)
        await signIn(credential, EMAIL_PIN_AUTH_TYPE, email, scope)

        // The digest, not the wrapped challenge: see `EmailAuthKeyHelper.spendKey`.
        return { token: spend }
      },
    }

    return plugin
  }

  const passwordPlugin = (scope: EmailPluginScope): AuthPluginFactory => () => {
    const plugin: AuthPlugin = {
      type: EMAIL_PASSWORD_AUTH_TYPE,

      init: async request => {
        authPluginHelper.assertType(request.type, plugin)

        return { challenge: randomBytes(PASSWORD_CHALLENGE_BYTES).toString('base64url') }
      },

      authenticate: async credential => {
        authPluginHelper.assertType(credential.type, plugin)
        const account = scope.account
        // An account without a password is checked against a hash nobody knows: the same work and
        // the same refusal as a wrong password.
        const verified = await passwordHasher.verify(
          setup.policy.normalize(credential.credential ?? ''), account?.hash ?? ABSENT_PASSWORD_HASH
        )
        if (account == null || account.hash == null || !verified) {
          throw new AuthenFailed('email:password')
        }
        await signIn(
          credential, EMAIL_PASSWORD_AUTH_TYPE, emailAuthKeyHelper.normalizeEmail(credential.userId ?? ''), scope,
          account.id
        )

        return { token: emailAuthKeyHelper.spendKey(credential.challenge ?? '') }
      },
    }

    return plugin
  }

  const listFor: EmailAuthPlugins['listFor'] = scope => ({
    [EMAIL_PIN_AUTH_TYPE]: pinPlugin(scope),
    [EMAIL_PASSWORD_AUTH_TYPE]: passwordPlugin(scope),
  })

  return { listFor }
}
