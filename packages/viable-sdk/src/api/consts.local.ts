import { CONNECT_CALL_COLLECT_WAIT_SEC } from '@owlmeans/viable-common'

export const TRANSIENT_TRANSPORT_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
])

/**
 * A collect hop's HTTP deadline: the hold the platform answers within, plus room for the round trip
 * — a quiet hop must never read as a dropped line.
 */
export const COLLECT_HOP_TIMEOUT_MS = (CONNECT_CALL_COLLECT_WAIT_SEC + 10) * 1000

/**
 * How many collect hops in a row may DROP (a reset, a timeout, an edge's 502/503/504) before the
 * call's own promise gives up. A collect is a read, so a dropped hop is simply asked again; a
 * platform that stays unreachable is a failure the parent should hear about.
 */
export const COLLECT_DROPPED_HOPS = 3

/** The statuses an edge answers when it, not the platform, dropped a held response. */
export const COLLECT_DROPPED_STATUSES = new Set([502, 503, 504])

/** The code axios rejects a request with when its own deadline fired. */
export const AXIOS_TIMEOUT_CODE = 'ECONNABORTED'

/** A `pending` answered faster than this was not held, so the next hop waits {@link COLLECT_PAUSE_MS} first. */
export const COLLECT_FAST_MS = 1_000

/** The rest after an unheld `pending`, so a platform that answers at once is not asked in a hot loop. */
export const COLLECT_PAUSE_MS = 1_000
