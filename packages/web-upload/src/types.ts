import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { UploadClient } from '@owlmeans/client-upload'
import type { FileKind, UploadedFile, UploadPolicy, UploadProtocols, UploadReason, UploadSession, UploadTotals } from '@owlmeans/upload'
import type { UploadEntryStatus, UploadRejectedBy } from './consts.js'

/** A file and the relative path it is added under (folders kept: `site/docs/brief.md`). */
export interface UploadPickedFile {
  file: Blob
  path: string
}

/** A browser `File` as this package reads it — a picked folder's `webkitRelativePath` included. */
export interface UploadFileLike extends Blob {
  readonly name: string
  readonly webkitRelativePath?: string
}

/** What `add` takes: a drop's or a paste's `DataTransfer`, picked files, or files with their paths. */
// The browser's own shapes plus picked pairs — a union.
export type UploadSource = DataTransfer | ArrayLike<UploadFileLike> | Iterable<UploadFileLike> | UploadPickedFile[]

/** Which limit of the policy a local `limits` refusal broke. */
// A closed set — a union.
export type UploadLimitKind = 'file-bytes' | 'files' | 'total-bytes'

/** One file of an upload queue. */
export interface UploadEntry {
  id: string
  /** The path it is sent under: normalized, folders kept; a refused path in its display form. */
  path: string
  /** The last segment of `path`. */
  name: string
  size: number
  /** The declared media type, `''` when the browser knows none. */
  type: string
  /** Guessed from the name and type while local; the server's detected kind once it decided. */
  kind: FileKind
  /** The local file. Absent on an entry an archive produced on the server. */
  file?: Blob
  status: UploadEntryStatus
  /** Share of its bytes sent, `0…1`. */
  progress: number
  /** Why it is `rejected`. */
  reason?: UploadReason
  /** Which limit a local `limits` refusal broke. */
  limit?: UploadLimitKind
  rejectedBy?: UploadRejectedBy
  /** The failure left after the client's retries (`failed`). */
  error?: unknown
  /** Its HTTP status, when the server answered one. */
  httpStatus?: number
  /** The server's decision: its row (an archive rejected whole included), or the one row a produced entry stands for. */
  server?: UploadedFile[]
  /** The path of the archive this entry was unpacked from. */
  from?: string
}

/** A queue-wide violation of the policy, behind one or more locally refused entries. */
export interface UploadViolation {
  /** `max-files`: more files than the policy allows; `max-total-bytes`: more bytes together; `max-file-bytes`: files larger than one may be. */
  code: 'max-files' | 'max-total-bytes' | 'max-file-bytes'
  /** The policy's ceiling. */
  limit: number
  /** Files (`max-files`) or bytes (`max-total-bytes`) the queue wants to hold; the largest refused size (`max-file-bytes`). */
  actual: number
  /** The refused entries. */
  entries: string[]
}

/** What the queue holds, counted. */
export interface UploadQueueTotals {
  /** Entries still to send that the precheck lets through (queued and failed). */
  pending: UploadTotals
  accepted: UploadTotals
  uploading: number
  rejected: number
  failed: number
  /** Accepted, uploading and pending — what the session holds once everything pending is accepted. */
  planned: UploadTotals
  /** What the policy still allows past `planned`. */
  remaining: UploadTotals
}

/** The bytes of the running upload; all zero while nothing is being sent. */
export interface UploadQueueProgress {
  loaded: number
  total: number
  /** `loaded / total`, `0…1`. */
  ratio: number
  /** Entries of the run, and how many of them are settled. */
  count: number
  settled: number
}

/** A queue's state — one immutable snapshot per change. */
export interface UploadQueueState {
  entries: UploadEntry[]
  /** The normalized policy entries are checked against. */
  policy: UploadPolicy
  totals: UploadQueueTotals
  violations: UploadViolation[]
  uploading: boolean
  progress: UploadQueueProgress
  /** The session of the last `start`. */
  sessionId?: string
}

/** How one `start` runs. */
export interface UploadStartOptions {
  /** The session as already known: the client then prechecks without a `state` call. */
  session?: UploadSession
  /** `false` sends without the client's precheck against the session (the local one still holds). */
  precheck?: boolean
  /** Aborts this run, like `abort()`. */
  signal?: AbortSignal
}

/** What a queue does. Every member is bound: destructure and pass them on freely. */
export interface UploadQueueActions {
  /**
   * Adds files: a `DataTransfer` (folders walked — call it inside the drop or paste handler, the
   * entries are taken synchronously), picked files or `{ file, path }` pairs. Resolves the added
   * entries, already prechecked. Ignored names (`DEFAULT_UPLOAD_IGNORE`) are skipped.
   */
  add: (source: UploadSource) => Promise<UploadEntry[]>
  /**
   * Removes an entry. One the server holds is removed from the session first (its row, or the row a
   * produced entry stands for) — a refusal there rethrows and keeps the entry. An uploading entry
   * stays (abort the run instead).
   */
  remove: (id: string) => Promise<void>
  /** Aborts a running upload and empties the queue. Files the server already holds stay in the session. */
  clear: () => void
  /**
   * Sends every queued and failed entry to the session through the client — `concurrency` at a
   * time, with progress. Results land on the entries: accepted, rejected with the server's reason, an
   * archive replaced by the entries it produced, failed with the error. An aborted run puts what it
   * did not finish back to `queued`. A call while a run is going answers that run.
   */
  start: (sessionId: string, options?: UploadStartOptions) => Promise<UploadEntry[]>
  /** Aborts the running upload. */
  abort: () => void
}

/** What a queue is configured with. */
export interface UploadQueueSettings {
  /** The policy entries are prechecked against; defaults fill what is missing (`uploadPolicyHelper.normalize`). */
  policy?: Partial<UploadPolicy>
  /** The client `start` and `remove` go through. */
  client?: UploadClient
  /** Files in flight at once. Default the client's (3). */
  concurrency?: number
  /** Retries after a transport failure. Default the client's (2). */
  retries?: number
  /** Names skipped when added. Default `DEFAULT_UPLOAD_IGNORE`. */
  ignore?: readonly string[]
  /** Files collected from one drop at most. Default `DEFAULT_COLLECT_LIMIT`. */
  collectLimit?: number
}

/** A queue held outside React: `useUploadQueue({ store })` renders it, and it outlives the screen that made it. */
export interface UploadQueueStore extends UploadQueueActions {
  /** The current snapshot (referentially stable until the next change). */
  state: () => UploadQueueState
  /** Called after every change. Answers the unsubscribe. */
  subscribe: (listener: () => void) => () => void
  /** Applies the settings given (undefined ones are kept); a policy change re-runs the precheck. */
  configure: (settings: UploadQueueSettings) => void
}

/** `useUploadQueue`'s options. */
export interface UploadQueueOptions extends UploadQueueSettings {
  /**
   * The upload tree, bound client-side in the context: the client is made over it
   * (`makeUploadClient`). Ignored when `client` is given.
   */
  protocols?: UploadProtocols
  /** The context `protocols` are bound in. Default the React one (`@owlmeans/client`'s `useContext`). */
  context?: BasicContext<BasicConfig>
  /** A queue made with `createUploadQueueStore` — kept across screens; the hook renders it. */
  store?: UploadQueueStore
}

/** The queue as a component sees it. */
export interface UploadQueue extends UploadQueueState, UploadQueueActions {
}

/**
 * Resolves a string of this package: the key (`pickers.files`, `reason.dangerous` …) and the English
 * text to show without a translation. `{name}` placeholders are filled after it answers.
 */
export interface UploadTranslate { (key: string, fallback: string): string }

/** What every part takes to speak the person's language. `useUploadI18n()` answers both. */
export interface UploadI18n {
  /** Strings; English without it. The parts never read i18n by themselves. */
  translate?: UploadTranslate
  /** The locale sizes and numbers are formatted in. Default `en`. */
  locale?: string
}
