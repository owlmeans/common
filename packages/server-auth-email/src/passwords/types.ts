import type { EmailPasswordRecord } from '../types.js'

/**
 * One record per account: its password hash (when one is set), whether it declined one, and its
 * own choice over the new-device PIN.
 */
export interface EmailPasswordStore {
  load: (accountId: string) => Promise<EmailPasswordRecord | null>
  /** Store a new hash; the account no longer counts as having declined. The new-device PIN choice stays. */
  setHash: (accountId: string, hash: string) => Promise<EmailPasswordRecord>
  /** Drop the hash and the new-device PIN choice; the account counts as having declined a password. */
  removeHash: (accountId: string) => Promise<EmailPasswordRecord>
  /** The person declined the offer; a hash already set stays, `updatedAt` stays. */
  decline: (accountId: string) => Promise<EmailPasswordRecord>
  /** The account's own new-device PIN choice; the hash and `updatedAt` stay. */
  setDevicePin: (accountId: string, enabled: boolean) => Promise<EmailPasswordRecord>
}
