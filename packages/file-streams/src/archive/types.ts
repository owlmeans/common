import type { FileInspector, VerifyPolicy } from '@owlmeans/file-inspector'
import type { FileSource, SignalOptions, SinkResult, TreeSink } from '../types.js'
import type { ArchiveFormat } from './consts.js'

export interface ArchiveLimits {
  maxEntries: number
  maxEntryBytes: number
  maxTotalBytes: number
  /** Largest expansion ratio of a zip entry or a gzip stream. */
  maxRatio: number
  /** Archive nesting followed: 1 keeps nested archives as files. */
  maxDepth: number
  maxPathBytes: number
  maxPathSegments: number
}

/** What an archive entry is. */
// A closed set of entry kinds — a union.
export type ArchiveEntryType = 'file' | 'directory' | 'symlink' | 'hardlink' | 'other'

export interface ArchiveEntryInfo {
  /** The path as the archive spells it. */
  path: string
  type: ArchiveEntryType
  size?: number
  compressedSize?: number
  mode?: number
  modifiedAt?: Date
  /** Reported, never created. */
  linkTarget?: string
  encrypted?: boolean
}

export interface ArchiveListOptions extends SignalOptions {
  limits?: Partial<ArchiveLimits>
  /** Skip detection. */
  format?: ArchiveFormat
}

export interface ArchiveExtractOptions extends ArchiveListOptions {
  /** Links in the archive: `skip` (reported, default) or `refuse` (`ArchiveError('link')`). */
  links?: 'skip' | 'refuse'
  /** An entry whose write or check fails: `fail` (default) or `skip`. Limit and safety errors always fail. */
  onEntryError?: 'fail' | 'skip'
  /** Leading path segments dropped. */
  strip?: number
  filter?: (entry: ArchiveEntryInfo) => boolean
  /** Each entry's head checked before it is written. */
  verify?: VerifyPolicy
  onEntry?: (entry: ArchiveEntryInfo, result: SinkResult) => void
}

export interface ExtractedEntry {
  entry: ArchiveEntryInfo
  /** The normalized path written. */
  path: string
  result: SinkResult
}

export interface SkippedEntry {
  entry: ArchiveEntryInfo
  reason: string
}

export interface ExtractResult {
  format: ArchiveFormat
  extracted: ExtractedEntry[]
  skipped: SkippedEntry[]
  bytes: number
}

export interface PackEntry {
  path: string
  source: FileSource | Uint8Array
  mode?: number
  modifiedAt?: Date
}

export interface ArchivePackOptions {
  /** The packed file's name. */
  name?: string
  /** zlib level. */
  level?: number
  /** A tar needs sizes up front: a source without one is spooled up to this many bytes. Default 512 MiB. */
  maxSpoolBytes?: number
}

export interface ArchiveHelperOptions {
  limits?: Partial<ArchiveLimits>
  inspector?: FileInspector
}

/** Reads and writes zip, tar, tar.gz and gz — safely, as streams, without trusting names. */
export interface ArchiveHelper {
  /** The format, from the bytes. */
  detect: (source: FileSource, options?: SignalOptions) => Promise<ArchiveFormat | null>
  /** Entries without extracting: a zip from its central directory (tail reads when ranged), a tar by its headers. */
  list: (source: FileSource, options?: ArchiveListOptions) => Promise<ArchiveEntryInfo[]>
  /** Every admitted entry written into the tree. */
  extract: (source: FileSource, tree: TreeSink, options?: ArchiveExtractOptions) => Promise<ExtractResult>
  /** A one-shot source producing the archive (gz takes exactly one entry). */
  pack: (format: ArchiveFormat, entries: Iterable<PackEntry> | AsyncIterable<PackEntry>, options?: ArchivePackOptions) => FileSource
  /** A source of the gzip-compressed bytes. */
  gzip: (source: FileSource, options?: ArchivePackOptions) => FileSource
  /** A source of the decompressed bytes, under the ratio and size limits. */
  gunzip: (source: FileSource, options?: ArchiveListOptions) => FileSource
}
