import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { InitializedService } from '@owlmeans/context'

export interface ThrottleRule {
  limit: number
  windowSeconds: number
}

export interface ThrottleDecision {
  allowed: boolean
  retryAfter: number
}

/** Generic fixed-subject, sliding-window throttle service for server auth plugins. */
export interface AuthThrottleService extends InitializedService {
  consume: (key: string, rules: readonly ThrottleRule[], token?: string) => Promise<ThrottleDecision>
}

export interface OtpChallenge {
  id: string
  emailKey: string
  codeHash: string
}

export enum OtpChallengeOutcome {
  Verified = 'verified',
  Invalid = 'invalid',
  Exhausted = 'exhausted',
  Missing = 'missing',
}

export interface OtpChallengeStore extends InitializedService {
  issue: (challenge: OtpChallenge, ttlSeconds: number) => Promise<boolean>
  verify: (
    id: string, emailKey: string, codeHash: string, maxFailedAttempts: number
  ) => Promise<OtpChallengeOutcome>
}

export interface OtpConfig extends ServerConfig {
  otp?: {
    /** Alias of the registered MailerService. Defaults to MAILER_SERVICE. */
    mailerAlias?: string
    /** Alias of the Redis resource for code storage. Defaults to OTP_RESOURCE. */
    resourceAlias?: string
    /** Alias of an OtpChallengeStore. Defaults to OTP_CHALLENGE_STORE. */
    challengeStoreAlias?: string
    /** Optional AuthThrottleService alias. Omitted means no issuance throttle. */
    throttleAlias?: string
    /** Sliding-window limits applied together by the throttle service. */
    throttleRules?: readonly ThrottleRule[]
    /** Alias of the IdentityLinkingService. Defaults to AUTH_IDENTITY_LINKING. */
    identityAlias?: string
  }
}

export interface OtpContext<C extends OtpConfig = OtpConfig> extends ServerContext<C> {}
