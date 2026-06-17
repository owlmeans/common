import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

export interface OtpConfig extends ServerConfig {
  otp?: {
    /** Alias of the registered MailerService. Defaults to MAILER_SERVICE. */
    mailerAlias?: string
    /** Alias of the Redis resource for code storage. Defaults to OTP_RESOURCE. */
    resourceAlias?: string
    /** Alias of the IdentityLinkingService. Defaults to AUTH_IDENTITY_LINKING. */
    identityAlias?: string
  }
}

export interface OtpContext<C extends OtpConfig = OtpConfig> extends ServerContext<C> {}
