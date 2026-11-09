/**
 * The devices an account signed in on, kept as digests of the browser's random device id for
 * `ttlDays` after the last sign-in there, at most `limit` per account (the most recently seen).
 */
export interface EmailDeviceStore {
  /** The device is remembered and unexpired (`expiresAt > now`, whatever the TTL sweep has done). */
  known: (accountId: string, device: string) => Promise<boolean>
  /** Remember (or refresh) a device after a successful sign-in, then forget all but the newest `limit`. */
  remember: (accountId: string, device: string) => Promise<void>
  /** Forget every device of the account but `keep` (the current browser); the number forgotten. */
  forgetOthers: (accountId: string, keep?: string | null) => Promise<number>
}
