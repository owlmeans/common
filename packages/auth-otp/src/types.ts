import type { InitializedService } from '@owlmeans/context'

/** Passwordless email OTP service — generates, stores, and verifies short-lived one-time codes */
export interface OtpService extends InitializedService {
  /** Generate a code, persist it with TTL, email it, and return its opaque issuance id. */
  issueChallenge: (email: string) => Promise<string>
  /** Verify and atomically consume one issuance. */
  verifyChallenge: (email: string, issuanceId: string, code: string) => Promise<void>
}
