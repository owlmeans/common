import type { Readable } from 'node:stream'
import type { InitializedService } from '@owlmeans/context'
import type { ArchiveHelper, TransferHelper, Workspace } from '@owlmeans/file-streams'
import type { FileInspector } from '@owlmeans/file-inspector'
import type { FileScope } from '@owlmeans/storage-common'
import type { UploadedFile, UploadPolicy, UploadTotals } from '@owlmeans/upload'
import type { UploadReceiver, UploadSessionState, UploadSessionStore } from '../types.js'

export interface UploadServiceOptions {
  /** Default `upload`. */
  alias?: string
  /** The policy of every session (a session may narrow it at open). Defaults: `DEFAULT_UPLOAD_POLICY`. */
  policy?: Partial<UploadPolicy>
  sessions: UploadSessionStore
  receiver: UploadReceiver
  /** Where files are spooled. Default `createWorkspace({ root: 'owlmeans-upload' })` (under `os.tmpdir()`). */
  workspace?: Workspace
  inspector?: FileInspector
  archives?: ArchiveHelper
  transfer?: TransferHelper
}

/** A session opened by the server itself (an application that keys sessions by its own id). */
export interface UploadOpenInput {
  /** One path segment (`[A-Za-z0-9][A-Za-z0-9._-]*`, ≤ 128). Default a random UUID. */
  id?: string
  scope: FileScope
  owner?: string
  /** Narrows the service policy for this session. */
  policy?: Partial<UploadPolicy>
  /** An announcement refused up front (`UploadLimitError`) when it cannot fit. */
  expect?: UploadTotals
}

/** One file arriving: its relative path, the bytes and what the request declared. */
export interface UploadIncoming {
  path: string
  stream: Readable
  /** The request's Content-Length. */
  length?: number
  /** The declared size (a streamed request without a length). */
  size?: number
  /** The declared media type. */
  type?: string
  signal?: AbortSignal
}

/**
 * Upload sessions and the intake of their files. Members are trusted server-side calls — the
 * handlers check the caller's ownership before they reach them.
 */
export interface UploadService extends InitializedService {
  /** The service policy every session starts from. */
  policy: () => UploadPolicy
  /** Opens a session; an existing one of the same owner is answered as it is (idempotent). */
  open: (input: UploadOpenInput) => Promise<UploadSessionState>
  /** @throws {UploadSessionNotFoundError} */
  get: (id: string) => Promise<UploadSessionState>
  load: (id: string) => Promise<UploadSessionState | null>
  /**
   * One file through the whole intake: path check → reservation → spool → verification → (an archive)
   * unpack, each entry the same way → receiver → spool removed. Answers every file decided.
   * @throws {UploadSessionNotFoundError} {UploadSessionStateError} unless the session is open
   */
  receive: (id: string, incoming: UploadIncoming) => Promise<UploadedFile[]>
  /** Drops a file (the receiver's `remove` for an accepted one); unknown file ids answer the session as it is. */
  remove: (id: string, fileId: string) => Promise<UploadSessionState>
  /** open → sealed (idempotent); the receiver's `seal`; the session's spool cleaned. */
  seal: (id: string) => Promise<UploadSessionState>
  /** open → aborted (idempotent); the receiver's `abort`; the session's spool cleaned. */
  abort: (id: string) => Promise<UploadSessionState>
}
