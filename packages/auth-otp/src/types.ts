import type { InitializedService } from '@owlmeans/context'

/**
 * The mail a login code travels in, as templates: every part may carry `{{code}}` (the code) and
 * `{{minutes}}` (its lifetime in minutes), substituted at issuance.
 */
export interface OtpMessage {
  subject: string
  text: string
  html: string
}

export interface OtpIssueOptions {
  /** Replaces the default English login-code mail; omitted keeps it. */
  message?: OtpMessage
}

/** Passwordless email OTP service — generates, stores, and verifies short-lived one-time codes */
export interface OtpService extends InitializedService {
  /** Generate a code, persist it with TTL, email it, and return its opaque issuance id. */
  issueChallenge: (email: string, opts?: OtpIssueOptions) => Promise<string>
  /** Verify and atomically consume one issuance. */
  verifyChallenge: (email: string, issuanceId: string, code: string) => Promise<void>
  /**
   * Developer seam: replace the code of a pending issuance, keeping its lifetime and resetting its
   * failed attempts. `false` when the issuance is gone, names another address, the code is not
   * `OTP_CODE_LENGTH` digits, or the store cannot rewrite. Never expose it to the public.
   */
  rewriteChallenge?: (email: string, issuanceId: string, code: string) => Promise<boolean>
}
