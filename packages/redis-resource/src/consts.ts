export const DEFAULT_DB_ALIAS = 'redis'

/**
 * Redis is UNPAGED: `list()` without a `size` returns every match, and `0` says exactly that.
 * There is no server side LIMIT to fall back on — answering a criteria already walked the whole
 * namespace — so an implied default would only hide records without saving any work.
 */
export const DEFAULT_PAGE_SIZE = 0

/** Keys per SCAN round trip. Bounded so one sweep never blocks the server the way KEYS does. */
export const SCAN_BATCH = 200

/** Keys per MGET / DEL round trip once SCAN has collected them. */
export const READ_BATCH = 200

/** Entries kept in a stream, trimmed approximately (`MAXLEN ~`) so trimming stays O(1)-ish. */
export const STREAM_MAX_LENGTH = 10000

/** How long a stream read blocks before the consumer loops and looks for pending entries. */
export const DEFAULT_STREAM_BLOCK = 1000

/** How long an unacknowledged entry may sit with its consumer before another may reclaim it. */
export const RECLAIM_IDLE = 60000

/** Entries reclaimed per XAUTOCLAIM pass. */
export const RECLAIM_COUNT = 10

/** Length of the generated consumer name when `consume` is not given one. */
export const CONSUMER_ID_LENGTH = 15
