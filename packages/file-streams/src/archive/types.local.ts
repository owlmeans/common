import type { Readable, Transform } from 'node:stream'
import type { ArchiveFormat } from './consts.js'
import type { RangeReader } from '../types.js'
import type { ArchiveEntryInfo, ArchiveLimits, ArchivePackOptions, PackEntry } from './types.js'

/** One entry an archive codec reached. */
export interface ArchiveEntryHandle {
  info: ArchiveEntryInfo
  /** The entry's bytes; for a stream archive valid only until the next entry. */
  open: () => Promise<Readable>
  /** Consumes what is left of the entry (a stream archive cannot move on before). */
  drain: () => Promise<void>
}

export interface EntryAdmission {
  path?: string
  skip?: string
}

/** The safety rules every codec's entries pass. */
export interface EntryGuard {
  readonly limits: ArchiveLimits
  /** The normalized path to write, or why the entry is skipped; throws on what must stop extraction. */
  admit: (info: ArchiveEntryInfo) => EntryAdmission
  /** Counts an entry's bytes against the per-entry and total ceilings. */
  meter: () => Transform
}

/** Expansion guard for a decompressed stream against the compressed bytes fed in. */
export interface RatioGuard {
  /** Counts compressed bytes; pipe the input through it. */
  readonly input: Transform
  /** Counts produced bytes and checks the ratio and the total; pipe the output through it. */
  readonly output: Transform
}

export interface FormatSniffer {
  /** The archive format leading bytes show, or `null`. */
  formatOf: (head: Uint8Array) => ArchiveFormat | null
  /** The original name a gzip header carries (FNAME). */
  gzipName: (head: Uint8Array) => string | undefined
}

export interface ZipCodec {
  /** Entries from the central directory, after the count, size, ratio and overlap checks. */
  entries: (reader: RangeReader, limits: ArchiveLimits) => AsyncGenerator<ArchiveEntryHandle>
  /** A zip of the entries, as a stream. */
  pack: (entries: Iterable<PackEntry> | AsyncIterable<PackEntry>, options: ArchivePackOptions) => Readable
}

export interface TarCodec {
  /** Entries in stream order; each must be consumed (or drained) before the next. */
  entries: (stream: Readable) => AsyncGenerator<ArchiveEntryHandle>
  /** A tar of the entries, as a stream (sizes are learned first, spooling when unknown). */
  pack: (entries: Iterable<PackEntry> | AsyncIterable<PackEntry>, options: ArchivePackOptions) => Readable
}

/** A source opened for reading an archive: random access when possible, otherwise a stream. */
export interface AcquiredArchive {
  format: ArchiveFormat | null
  head: Uint8Array
  reader?: RangeReader
  stream?: Readable
  dispose: () => Promise<void>
}

/** The part of a tar entry writer the packer uses. */
export interface TarEntryWriter {
  write: (chunk: Buffer) => boolean
  end: (data?: unknown) => unknown
  once: (event: string, listener: (...args: unknown[]) => void) => unknown
}
