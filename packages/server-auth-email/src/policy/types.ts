/** What a new password must be, from `EmailAuthServerOptions.password`. */
export interface EmailPasswordPolicy {
  /** Password sign-in and the password routes are on. */
  enabled: () => boolean
  /** The form a password is hashed and checked in: Unicode NFKC. */
  normalize: (password: string) => string
  /**
   * The normalized password when the policy accepts it: within the length bounds (counted in
   * characters) and not the account's own address.
   *
   * @throws {EmailPasswordWeak} `weak:length` or `weak:email` (422).
   */
  assert: (password: string, email: string) => string
}
