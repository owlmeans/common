export const DEFAULT_UPLOAD_CONCURRENCY = 3

export const DEFAULT_UPLOAD_RETRIES = 2

/** The first pause before a retry; each next one doubles it. */
export const UPLOAD_RETRY_DELAY_MS = 300

/** Statuses a retry may cure — a transport failure without a status is retried too. */
export const UPLOAD_RETRY_STATUSES: readonly number[] = Object.freeze([408, 425, 429, 500, 502, 503, 504])
