import type { AuthPayload } from '@owlmeans/auth'
import type { OtpMessage } from '@owlmeans/auth-otp'
import type { AuthPluginFactory } from '@owlmeans/server-auth/manager/plugins'
import type { EmailPasswordPolicy } from '../policy/types.js'

/** What the plugins of every request share: the services they call and the password policy. */
export interface EmailPluginSetup {
  otpAlias: string
  identityAlias: string
  policy: EmailPasswordPolicy
}

/** What one request hands its private sign-in plugins. */
export interface EmailPluginScope {
  /** The PIN mail of this request (the sign-in template in the request's language). */
  message: OtpMessage
  /** The verified-for account of a password sign-in; absent or `null` refuses every password. */
  account?: { id: string, hash: string | null } | null
  /** Told the identity a plugin signed in, before the token is signed. */
  onLinked?: (payload: AuthPayload) => void
}

/** The exclusive plugin list of one request: `EMAIL_PIN_AUTH_TYPE` and `EMAIL_PASSWORD_AUTH_TYPE`. */
export type EmailPluginList = Record<string, AuthPluginFactory>

/**
 * The private sign-in plugins. They are built per request and handed to
 * `makeAuthModel(ctx, { plugins })` as its EXCLUSIVE list — never registered globally, so the auth
 * manager's own `/authentication/*` routes cannot reach them and no global type reaches the e-mail
 * routes. Both stamp their own type on the token (`email-pin`, `email-password`), never
 * `email-otp` or `OneTimeToken`.
 */
export interface EmailAuthPlugins {
  listFor: (scope: EmailPluginScope) => EmailPluginList
}
