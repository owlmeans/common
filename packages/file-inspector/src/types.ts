import type { Readable } from 'node:stream'

export interface ProbeSignalOptions {
  /** Aborts the operation; the rejection is the signal's reason. */
  signal?: AbortSignal
}

/** What a source says about a file. Every field is a claim until a verdict confirms it. */
export interface ProbeSourceInfo {
  /** A redacted origin, for logs only. */
  origin?: string
  /** A base name — its extension is a claim. */
  name?: string
  /** A declared media type. */
  mime?: string
  /** Declared bytes. */
  size?: number
}

/** Random access over ONE immutable version of a file. */
export interface ProbeRangeReader {
  /** Total bytes of the file. */
  readonly size: number
  /** Up to `length` bytes at `offset`; fewer only at the end of the file. */
  read: (offset: number, length: number, signal?: AbortSignal) => Promise<Uint8Array>
  close: () => Promise<void>
}

export interface ProbeOpenedFile {
  /** The body from its first byte; a probe reads its head and destroys it. */
  stream: Readable
}

/**
 * Where a probe reads a file from. A `@owlmeans/file-streams` `FileSource` satisfies it as is; any
 * other origin implements these three members.
 */
export interface ProbeSource {
  /** Metadata without the body. */
  info: (options?: ProbeSignalOptions) => Promise<ProbeSourceInfo>
  /** A fresh body stream — used only when the source has no random access. */
  open: (options?: ProbeSignalOptions) => Promise<ProbeOpenedFile>
  /** Random access when the origin offers it, otherwise `null` (the probe then reads the head only). */
  ranges: (options?: ProbeSignalOptions) => Promise<ProbeRangeReader | null>
}
