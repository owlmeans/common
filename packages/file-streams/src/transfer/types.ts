import type { FileInspector, FileVerdict, VerifyPolicy } from '@owlmeans/file-inspector'
import type { FileInfo, FileSink, FileSource, SignalOptions, SinkResult, TreeSink } from '../types.js'

export interface TransferLimits {
  /** Bytes accepted, counted after content decoding. Default 512 MiB. */
  maxBytes: number
  /** Whole-transfer deadline. Default 600 000 ms. */
  timeoutMs: number
  /** Longest silence between chunks. Default 30 000 ms. */
  idleTimeoutMs: number
}

export interface TransferProgress {
  bytes: number
  total?: number
  elapsedMs: number
}

export interface TransferProgressListener {
  (progress: TransferProgress): void
}

export interface TransferOptions extends SignalOptions {
  limits?: Partial<TransferLimits>
  /** Head verification before the first byte reaches the sink. Default `{}` (on); `false` skips it. */
  verify?: VerifyPolicy | false
  onProgress?: TransferProgressListener
  /** Default 250 ms; a final call always fires. */
  progressIntervalMs?: number
  hash?: 'sha256'
  /** Overrides of the source's claims (a target name, a known media type). */
  info?: Partial<Omit<FileInfo, 'origin'>>
}

export interface TransferResult {
  bytes: number
  durationMs: number
  info: FileInfo
  verdict?: FileVerdict
  sha256?: string
  sink: SinkResult
}

export interface TransferHelperOptions {
  inspector?: FileInspector
  limits?: Partial<TransferLimits>
}

/** Moves one file from a source to a sink under limits, verifying it on the way. */
export interface TransferHelper {
  /** Source → sink; the head is verified before the sink sees a byte unless `verify: false`. */
  copy: (source: FileSource, sink: FileSink, options?: TransferOptions) => Promise<TransferResult>
  /** The same into a tree, under the source's own sanitized name (or `options.info.name`). */
  copyInto: (source: FileSource, tree: TreeSink, options?: TransferOptions) => Promise<TransferResult>
}
