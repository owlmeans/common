import type { UploadEntry, UploadViolation } from '../types.js'

/** An entry and what the store keeps about it beside the snapshot. */
export interface QueueRecord {
  entry: UploadEntry
  /** The path as added — re-checked on every evaluation (a display form may well read as valid). */
  raw: string
  /** Bytes of it sent in the running upload. */
  loaded: number
}

/** The upload going on: its abort, the entries it sends, and its result. */
export interface QueueRun {
  controller: AbortController
  ids: Set<string>
  promise: Promise<UploadEntry[]>
}

/** The precheck applied to every record still to send. */
export interface QueueEvaluation {
  records: QueueRecord[]
  violations: UploadViolation[]
}
