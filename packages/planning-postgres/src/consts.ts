/** The four resource aliases — each is also the physical table name (sanitized). */
export const RES_PLANNING_CARD = 'planning-card'
export const RES_PLANNING_TRANSITION = 'planning-transition'
export const RES_PLANNING_LINK = 'planning-link'
export const RES_PLANNING_SCHEMA = 'planning-schema'

/** The alias the store answers `PlanningStore.alias` with, and the service its placeholders name. */
export const PLANNING_POSTGRES_STORE = 'planning-postgres'

export const DEFAULT_PLANNING_POSTGRES_LIMITS = Object.freeze({
  /** The most log rows one fold transaction reads and applies; the rest follow in the next round. */
  foldBatch: 500,
  /**
   * How long a gap in a card's log — a seq allocated with no row yet — is an append still in
   * flight. Older, it is a lost allocation: the fold writes a failed placeholder and goes on.
   */
  gapGraceMs: 30_000,
  /** A pending row older than this makes every status read of it a heal: a background fold. */
  healAfterMs: 1_000,
  /** What `recover()` folds by default: cards whose oldest pending row is older than this. */
  recoverAfterMs: 60_000,
  /** `SET LOCAL lock_timeout` of a fold transaction, in milliseconds. */
  lockTimeoutMs: 10_000,
})

/** How many cards one `recover()` folds by default. */
export const DEFAULT_RECOVER_LIMIT = 100

/** The cause and error of a failed placeholder written over a lost allocation. */
export const LOST_ALLOCATION = 'lost-allocation'

/** Rounds (transactions) one `fold()` runs while a round reports more rows than `foldBatch`. */
export const MAX_FOLD_ROUNDS = 16

/** Passes of prelude and fold one transaction runs — each over one run of consecutive pending rows. */
export const MAX_FOLD_PASSES = 64

/** The private schema row that is an organization's monotonic schema revision. */
export const SCHEMA_HEAD_KIND = 'head'
export const SCHEMA_HEAD_KEY = 'head'

/** Reconnect backoff of the LISTEN connection, doubling from the first to the last, in milliseconds. */
export const BUS_BACKOFF: readonly [number, number] = Object.freeze([1_000, 30_000]) as readonly [number, number]

/** Postgres refuses a NOTIFY payload of 8000 bytes or more; a frame stays under this. */
export const NOTIFY_PAYLOAD_MAX = 7_900

/** The file a target adds for each resource — what a missing-resource error names. */
export const PLANNING_RESOURCE_FILES = Object.freeze({
  card: 'src/resources/planning/card.ts',
  transition: 'src/resources/planning/transition.ts',
  link: 'src/resources/planning/link.ts',
  schema: 'src/resources/planning/schema.ts',
})
