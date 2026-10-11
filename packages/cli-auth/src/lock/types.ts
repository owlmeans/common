import type { SignInLockInfo } from '../types.js'

/** What the claiming process states about the sign-in; the lock adds who it is and its nonce. */
export interface SignInLockDraft extends Omit<SignInLockInfo, 'pid' | 'nonce' | 'apiUrl'> {}

export interface SignInLockClaim {
  /** This process wrote the lock and drives the sign-in. */
  owner: boolean
  info: SignInLockInfo
}

/** The cross-process sign-in lock at one path. */
export interface SignInLockHelper {
  /** The lock as written, or `null` for a missing or malformed file. */
  readLock: () => Promise<SignInLockInfo | null>
  /**
   * Become the one process driving this API URL's sign-in, or find out somebody else already is.
   *
   * Best-effort, not a mutual-exclusion guarantee: two processes racing this at the exact same
   * instant can both conclude they are the owner, and each then drives its own independent device
   * authorization. That costs an extra browser tab, never a corrupted file or a double-spent code —
   * this is a convenience for the ordinary case (a person running two terminal tabs), not a
   * correctness boundary.
   */
  claimOrJoinLock: (apiUrl: string, info: SignInLockDraft) => Promise<SignInLockClaim>
  /** Clear the lock, but only the copy of it this process itself wrote — a stale read after
   * somebody else has already reclaimed the same path must never delete THEIR lock instead. */
  releaseLock: (nonce: string) => Promise<void>
}
