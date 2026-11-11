import type { FileSource } from '@owlmeans/file-streams'
import type { FileScope } from '@owlmeans/storage-common'
import type { UploadedFile, UploadSession, UploadSessionStatus, UploadTotals } from '@owlmeans/upload'

/** A session as the server keeps it: the wire view plus what only the server may see. */
export interface UploadSessionState extends UploadSession {
  /** Where its files are spooled — claimed once at open, read back, never recomputed. */
  scope: FileScope
  /** Who may use it (an organization's stable key by default); absent for a guest session. */
  owner?: string
  /** Accepted plus in-flight files and bytes — what a reservation is checked against. */
  reserved: UploadTotals
  /** Path keys (`uploadPolicyHelper.pathKey`) reserved by files still in flight. */
  pending: string[]
  /** What the receiver answered per accepted file id (a remote file id, a key). */
  refs: Record<string, string>
}

/** What one file (or one archive entry) holds while it is in flight. */
export interface UploadReservation {
  files: number
  bytes: number
  /** Normalized paths; the store compares them by `uploadPolicyHelper.pathKey`. */
  paths?: string[]
}

/** What a reservation came to. */
// A closed set of outcomes — a union.
export type UploadReserveOutcome = 'reserved' | 'limits' | 'duplicate' | 'closed' | 'missing'

/**
 * Where sessions live. Every member is atomic per session id — that is what makes the limits exact
 * across parallel uploads; how a backend achieves it is its own (see `createResourceSessionStore`).
 */
export interface UploadSessionStore {
  /** Stores a new session; `null` when one already exists under its id. */
  create: (state: UploadSessionState) => Promise<UploadSessionState | null>
  get: (id: string) => Promise<UploadSessionState | null>
  /**
   * Holds files, bytes and paths against the session's policy: `limits` past the count or the total,
   * `duplicate` for a path held or accepted already, `closed` unless the session is open, `missing`.
   */
  reserve: (id: string, reservation: UploadReservation) => Promise<UploadReserveOutcome>
  /** Gives a reservation back (clamped at zero). */
  release: (id: string, reservation: UploadReservation) => Promise<void>
  /**
   * Appends a decided file. An accepted one moves its path from pending to the files and counts in
   * the totals — only while the session is open; `null` when it was not recorded (closed or missing).
   */
  record: (id: string, file: UploadedFile, ref?: string) => Promise<UploadSessionState | null>
  /** Drops a file row (an accepted one gives its totals and reservation back); `null` when the session is missing. */
  discard: (id: string, fileId: string) => Promise<UploadDiscarded | null>
  /** Moves the session to `to` when its status is one of `from` (stamping `sealedAt`/`abortedAt`); `null` otherwise. */
  status: (id: string, to: UploadSessionStatus, from: UploadSessionStatus[]) => Promise<UploadSessionState | null>
}

export interface UploadDiscarded {
  state: UploadSessionState
  /** The row dropped; absent when the session held no such file. */
  file?: UploadedFile
}

/** What a receiver keeps about a file it took. */
export interface UploadReceipt {
  /** Where it went (a remote file id, a key) — handed back to `remove`. */
  ref?: string
}

/**
 * The application port every accepted file is handed to — after verification, before the spool is
 * removed. Throw `UploadRejectedError(reason)` to reject a file with a vocabulary reason; any other
 * error fails the request (the file is not recorded, the client may retry it).
 */
export interface UploadReceiver {
  receive: (session: UploadSessionState, file: UploadedFile, source: FileSource) => Promise<UploadReceipt | void>
  /** An accepted file removed from the session (or one whose session closed while it was in flight). */
  remove?: (session: UploadSessionState, file: UploadedFile, ref?: string) => Promise<void>
  seal?: (session: UploadSessionState) => Promise<void>
  abort?: (session: UploadSessionState) => Promise<void>
}
