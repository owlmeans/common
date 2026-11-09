/** Password hashing: `node:crypto` scrypt, stored as `scrypt$N$r$p$<salt>$<key>` (base64url parts). */
export interface PasswordHasher {
  /** A new hash of `password` under a fresh 16-byte salt. */
  hash: (password: string) => Promise<string>
  /**
   * Whether `password` is the one `stored` was made from — compared in constant time. A stored value
   * in an unknown format (or with parameters beyond the memory bound) answers `false`, never throws.
   */
  verify: (password: string, stored: string) => Promise<boolean>
}
