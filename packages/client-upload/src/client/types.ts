import type { CallOptions } from '@owlmeans/entrypoint'
import type { UploadedFile, UploadOpenRequest, UploadReason, UploadSession } from '@owlmeans/upload'
import type { UploadInput } from '../types.js'

/** Where one input stands. */
// A closed set of states — a union.
export type UploadFileState = 'queued' | 'sending' | 'done' | 'refused' | 'failed'

export interface UploadFileProgress {
  index: number
  path: string
  /** Bytes sent of this input. */
  loaded: number
  total?: number
  state: UploadFileState
}

export interface UploadOverallProgress {
  /** Bytes sent of every input sent. */
  loaded: number
  /** Known bytes of every input sent. */
  total: number
  /** Inputs settled (done, refused or failed). */
  settled: number
  count: number
}

export interface UploadProgressListener {
  (file: UploadFileProgress, overall: UploadOverallProgress): void
}

export interface UploadRunOptions {
  /** Inputs in flight at once. Default 3. */
  concurrency?: number
  /** Retries of an input after a transport failure, a 5xx, 408 or 429 (never a refusal). Default 2. */
  retries?: number
  onProgress?: UploadProgressListener
  /** Aborts every input in flight and every one still queued. */
  signal?: AbortSignal
  /** The session as already known — the precheck then needs no `state` call. */
  session?: UploadSession
  /** `false` sends without the precheck. Default `true`. */
  precheck?: boolean
  /** Added to every call (`timeout`, `auth`, a host). */
  call?: Omit<CallOptions, 'signal' | 'onUploadProgress' | 'onDownloadProgress'>
}

/** What became of one input. */
export interface UploadInputResult {
  index: number
  /** Normalized when valid. */
  path: string
  /** The server's decision — one row, or the rows of an unpacked archive; empty when nothing reached it. */
  files: UploadedFile[]
  /** Refused by the precheck, never sent. */
  refused?: UploadReason
  /** The failure that remained after the retries. */
  error?: unknown
  /** Its HTTP status, when the server answered one. */
  status?: number
}

/** An upload session's calls from a browser or a Bun process, over a client-bound protocol tree. */
export interface UploadClient {
  open: (request?: UploadOpenRequest) => Promise<UploadSession>
  state: (sessionId: string) => Promise<UploadSession>
  /** Prechecks the inputs, then sends them `concurrency` at a time with retries; one result per input, in order. */
  upload: (sessionId: string, inputs: UploadInput[], options?: UploadRunOptions) => Promise<UploadInputResult[]>
  remove: (sessionId: string, fileId: string) => Promise<UploadSession>
  seal: (sessionId: string) => Promise<UploadSession>
  abort: (sessionId: string) => Promise<UploadSession>
}
