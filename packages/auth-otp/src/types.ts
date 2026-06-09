import type { InitializedService } from '@owlmeans/context'

/** Passwordless OTP/magic-link authentication service — implemented in Phase 2 */
export interface OtpService extends InitializedService {
  // Phase 2: issueChallenge, verifyChallenge
}
