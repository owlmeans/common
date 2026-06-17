import type { InitializedService } from '@owlmeans/context'

/** Passwordless email OTP service — generates, stores, and verifies short-lived one-time codes */
export interface OtpService extends InitializedService {
  /** Generate a code, persist it with TTL, and email it to the user. */
  issueChallenge: (email: string) => Promise<void>
  /** Verify and consume the code. Throws OtpInvalidError if the code is wrong or expired. */
  verifyChallenge: (email: string, code: string) => Promise<void>
}
