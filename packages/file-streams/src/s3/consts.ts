export const DEFAULT_PART_SIZE = 8 * 1024 * 1024

/** S3's smallest part (all but the last). */
export const MIN_PART_SIZE = 5 * 1024 * 1024

/** S3's most parts per upload. */
export const MAX_PARTS = 10_000

export const DEFAULT_UPLOAD_CONCURRENCY = 2

/** S3's most keys per DeleteObjects request. */
export const S3_DELETE_BATCH_SIZE = 1000
