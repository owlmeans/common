import type { ArchiveLimits } from './types.js'

/** The archive formats read and written; detected from bytes, never from names. */
export enum ArchiveFormat {
  Zip = 'zip',
  Tar = 'tar',
  TarGz = 'tar.gz',
  Gzip = 'gz',
}

export const DEFAULT_ARCHIVE_LIMITS: Readonly<ArchiveLimits> = Object.freeze({
  maxEntries: 10_000,
  maxEntryBytes: 512 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
  maxRatio: 200,
  maxDepth: 1,
  maxPathBytes: 1024,
  maxPathSegments: 64,
})

/** Expansion ratios are judged only past this many produced bytes. */
export const RATIO_FLOOR_BYTES = 1024 * 1024

/** A zip local file header without its name and extra field. */
export const ZIP_LOCAL_HEADER_BYTES = 30

/** Names that mark a nested archive. */
export const NESTED_ARCHIVE_EXTENSIONS: readonly string[] = Object.freeze(['zip', 'tar', 'tar.gz', 'tgz', 'gz'])
