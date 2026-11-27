import { CONNECT_CALL_COLLECT_WAIT_SEC, connect } from '@owlmeans/viable-common'

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

/** What a platform older than a route answers for it — read as "this platform cannot say". */
export const NOT_FOUND = 404

/**
 * One material's HTTP deadline: a file of up to `MATERIALS_LIMITS.fileBytes` over a slow line. An
 * upload runs past its tool's answer when it must, so this bounds the file, never the tool.
 */
export const MATERIALS_FILE_TIMEOUT_MS = 120_000

/**
 * The HTTP deadline of a change of a project's apps (`connect.apps.*`): a short run on the platform —
 * the platform update, the stamping, the install, the re-ensure, the drawing and the rebuild. The call
 * is named and collected, so this bounds a held request on a platform that answers no `{ pending }`;
 * the tool answers at its own deadline long before.
 */
export const APPS_CHANGE_TIMEOUT_MS = 20 * 60_000

/**
 * The calls named (`x-viable-call`) and collected in EVERY mode, not only the delegated one, whatever
 * their method: each is work the platform does that may outlast what an edge holds a response open —
 * a change of the project's apps (a short run with its rebuild), a triaged request (the preview may
 * have to wake before the triage answers) and Run all's proposal (`connect.cards.plan`, a GET: one
 * model call of up to three minutes). The platform answers them `{ pending }` early and keeps working;
 * the transport collects the outcome. A platform that does not defer one ignores the header and holds
 * the request open, exactly as before.
 */
export const ALWAYS_COLLECTED_ALIASES: ReadonlySet<string> = new Set([
  connect.apps.add, connect.apps.addArea, connect.apps.bindArea, connect.project.request, connect.cards.plan,
])
