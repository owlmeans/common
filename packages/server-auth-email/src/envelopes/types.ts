import type { EmailPasswordPurpose, EmailTechWaiverView } from '@owlmeans/auth-email'

/** What a confirmation challenge binds: one purpose, one account, one address, one mailed PIN. */
export interface EmailConfirmClaim {
  purpose: EmailPasswordPurpose
  accountId: string
  email: string
  issuanceId: string
}

/** A mailed PIN that is still pending: the address it went to and its OTP issuance. */
export interface EmailPendingClaim {
  email: string
  issuanceId: string
}

/**
 * The envelopes e-mail sign-in signs and opens with the `AUTH_SRV_KEY` trusted record — the key the
 * auth manager signs its challenges and tokens with, so each check names the envelope TYPE it
 * expects, the TTL it may carry and the shape of its message, never the signature alone.
 */
export interface EmailEnvelopes {
  /**
   * A confirmation challenge (`EMAIL_CONFIRM_ENVELOPE`, a wrap), valid as long as its PIN.
   *
   * @throws {SyntaxError} when the `AUTH_SRV_KEY` record carries no secret (a configuration fault).
   */
  signConfirm: (claim: EmailConfirmClaim) => Promise<string>
  /** The claim of a confirmation challenge; `null` for another type, a bad signature, an expired or malformed one. */
  openConfirm: (challenge: string) => Promise<EmailConfirmClaim | null>
  /** The pending PIN behind a sign-in challenge (`EMAIL_PIN_AUTH_TYPE`) or a confirmation challenge. */
  openPending: (challenge: string) => Promise<EmailPendingClaim | null>
  /** A developer waiver (`EMAIL_WAIVER_ENVELOPE`, a token) for `EMAIL_WAIVER_TTL_SECONDS`. */
  signWaiver: () => Promise<EmailTechWaiverView>
  /** The waiver is of the right type and shape, signed by the auth service and unexpired. */
  verifyWaiver: (waiver: string) => Promise<boolean>
}
