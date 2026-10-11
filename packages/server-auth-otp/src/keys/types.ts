/** The storage keys of one OTP issuance: digests, never the raw address, id or code. */
export interface OtpKeyHelper {
  /** The challenge record key of an issuance id. */
  otpChallengeKey: (issuanceId: string) => string
  /** The case-insensitive digest of the address a code was sent to. */
  otpEmailKey: (email: string) => string
  /** The digest of a code, bound to its issuance. */
  otpCodeHash: (issuanceId: string, code: string) => string
}
