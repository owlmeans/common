import type { EmailPasswordRecord } from '../types.js'

/** One record per account: its password hash (when one is set) and whether it declined one. */
export interface EmailPasswordStore {
  load: (accountId: string) => Promise<EmailPasswordRecord | null>
  /** Store a new hash; the account no longer counts as having declined. */
  setHash: (accountId: string, hash: string) => Promise<EmailPasswordRecord>
  /** Drop the hash; the account counts as having declined a password. */
  removeHash: (accountId: string) => Promise<EmailPasswordRecord>
  /** The person declined the offer; a hash already set stays, `updatedAt` stays. */
  decline: (accountId: string) => Promise<EmailPasswordRecord>
}
