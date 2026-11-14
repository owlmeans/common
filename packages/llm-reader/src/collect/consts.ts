import type { CollectLimits } from './types.js'

/** The limits of one collect unless the caller lowers or raises them. */
export const DEFAULT_COLLECT_LIMITS: Readonly<CollectLimits> = Object.freeze({
  maxFiles: 100,
  maxFileBytes: 12 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxAssets: 150,
  maxAssetBytes: 30 * 1024 * 1024,
})

/** The folder cross-origin assets of a bundle go under: `external/<host>/<path>`. */
export const BUNDLE_EXTERNAL_DIR = 'external'

/** Deadline of one file's download, ms. */
export const DEFAULT_COLLECT_FILE_TIMEOUT_MS = 120_000
