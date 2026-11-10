export const DEFAULT_PART_SIZE = 8 * 1024 * 1024

/** S3's smallest part (all but the last). */
export const MIN_PART_SIZE = 5 * 1024 * 1024

/** S3's most parts per upload. */
export const MAX_PARTS = 10_000

export const DEFAULT_UPLOAD_CONCURRENCY = 2
