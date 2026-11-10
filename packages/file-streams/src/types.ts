import type { Readable } from 'node:stream'
import type { FileVerdict } from './inspector/types.js'

/** What is known about a file. Every field is a claim until a verdict confirms it. */
export interface FileInfo {
  /**
   * Redacted origin for logs and results: `https://host/path` (no userinfo, query or fragment;
   * long opaque segments masked), `s3://bucket/key`, a filesystem path, or `buffer`.
   */
  origin: string
  /** A safe base name — from Content-Disposition, the URL's last segment, the key, or the caller. */
  name?: string
  /** Declared bytes. Never trusted as a limit: counted bytes are. */
  size?: number
  /** Declared media type, lower-cased, without parameters; uninformative ones are dropped. */
  mime?: string
  /** A strong validator (ETag, `<mtimeMs>-<size>`); range reads refuse an origin that changed. */
  etag?: string
  modifiedAt?: Date
}

/** A byte span, `end` inclusive like HTTP; no `end` means to the last byte. */
export interface ByteRange {
  start: number
  end?: number
}

export interface SignalOptions {
  /** Aborts the operation; the rejection is the signal's reason. */
  signal?: AbortSignal
}

export interface OpenOptions extends SignalOptions {
  /** Open only this span — honoured when the origin supports ranges. */
  range?: ByteRange
}

export interface OpenedFile {
  stream: Readable
  info: FileInfo
  /** The span actually served, when a range was asked for and honoured. */
  range?: { start: number, end: number, total: number }
}

/** Random access over ONE immutable version of a file. */
export interface RangeReader {
  /** Total bytes of the file. */
  readonly size: number
  /** Up to `length` bytes at `offset`; fewer only at the end of the file. */
  read: (offset: number, length: number, signal?: AbortSignal) => Promise<Uint8Array>
  /** A stream over `[start, end)` — for spans too large to buffer. */
  stream: (start: number, end: number, signal?: AbortSignal) => Promise<Readable>
  close: () => Promise<void>
}

/** Where a file's bytes come from. */
export interface FileSource {
  /** `http`, `s3`, `file`, `buffer`, `stream`, `archive`, `gzip`. */
  readonly kind: string
  /** Metadata without the body (HEAD, HeadObject, stat); cached. */
  info: (options?: SignalOptions) => Promise<FileInfo>
  /** A fresh body stream. A one-shot source refuses a second open with `SourceError('consumed')`. */
  open: (options?: OpenOptions) => Promise<OpenedFile>
  /** Random access when the origin offers it, otherwise `null` (probing then reads the head only). */
  ranges: (options?: SignalOptions) => Promise<RangeReader | null>
}

export interface SinkInput {
  stream: Readable
  info: FileInfo
  /** The transfer's verdict, when one ran — sinks take the Content-Type from it. */
  verdict?: FileVerdict
}

export interface SinkWriteOptions extends SignalOptions {
  /** Ceiling on accepted bytes; a sink may lower it. */
  maxBytes?: number
}

export interface SinkResult {
  /** `file`, `s3`, `workload`, `buffer`. */
  kind: string
  /** Path, `s3://bucket/key` or workload file path. */
  location: string
  bytes: number
  /** Public URL when the destination has one — for S3 the one storage-resource answers. */
  url?: string
  etag?: string
  mime?: string
}

/** Where one file's bytes go. */
export interface FileSink {
  readonly kind: string
  /** Writes the whole stream and commits atomically; on failure nothing is left behind. */
  write: (input: SinkInput, options?: SinkWriteOptions) => Promise<SinkResult>
}

/** Many files under one root — a directory, an S3 prefix, a workload folder. */
export interface TreeSink {
  readonly kind: string
  /** The sink of one entry; `path` is normalized and confined to the root, otherwise `PathError`. */
  entry: (path: string) => FileSink
  /** An empty directory where the store has directories; a no-op elsewhere. */
  directory: (path: string, options?: SignalOptions) => Promise<void>
}
