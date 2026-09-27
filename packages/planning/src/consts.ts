/** What a workcard IS. Cards, projects and specifications share one id space and one fold. */
export enum WorkcardKind {
  Card = 'card',
  Project = 'project',
  Specification = 'specification',
}

/**
 * The three states every status of every flow maps onto.
 *
 * A provider's statuses are its own vocabulary; these three are the only ones generic code — a
 * summary, a board header, a gate — ever reads.
 */
export enum IntrinsicStatus {
  Planned = 'planned',
  InProgress = 'in-progress',
  Closed = 'closed',
}

/** Advancement order — `resolveIntrinsic` under {@link IntrinsicPolicy.All} takes the minimum. */
export const INTRINSIC_ORDER: Readonly<Record<IntrinsicStatus, number>> = Object.freeze({
  [IntrinsicStatus.Planned]: 0,
  [IntrinsicStatus.InProgress]: 1,
  [IntrinsicStatus.Closed]: 2,
})

/** How a type running several flows answers its one intrinsic status. */
export enum IntrinsicPolicy {
  /** The primary flow's status decides. */
  Primary = 'primary',
  /** The least advanced flow decides — closed only when every flow is closed. */
  All = 'all',
}

export enum TransitionAction {
  Create = 'create',
  Update = 'update',
  Transit = 'transit',
  Link = 'link',
  Unlink = 'unlink',
  Delete = 'delete',
}

export enum CommitState {
  Pending = 'pending',
  Committed = 'committed',
  Failed = 'failed',
}

export enum SpecificationFormat {
  Markdown = 'markdown',
  Json = 'json',
  Text = 'text',
}

export enum CodeStyle {
  Random = 'random',
  Sequential = 'sequential',
  Slug = 'slug',
}

/** Where a minted code must be unique. */
export enum CodeScope {
  Parent = 'parent',
  Entity = 'entity',
}

/** Service alias of the planning facade host. Identical on the server and in a client. */
export const PLANNING_SERVICE = 'planning'

/** The path segment the protocol tree answers under when the mount names none. */
export const PLANNING_PATH = '/planning'

/** The socket frame name the commit feed pushes under. */
export const PLANNING_COMMIT_EVENT = 'planning-commit'

/** The i18n resource the package's labels are registered under (`lib:planning.*`). */
export const PLANNING_I18N = 'planning'

/** A `from` that matches every status of the flow. */
export const ANY_STATUS = '*'

/** How long `committed()` waits by default, in milliseconds. */
export const DEFAULT_COMMIT_TIMEOUT = 30_000
/** Seconds a single long poll of `commit.get` holds by default. */
export const DEFAULT_COMMIT_POLL = 20
/** The longest single long poll a server grants, in seconds. */
export const MAX_COMMIT_POLL = 55
/** Re-rolls a code policy gets before it refuses with `CodeTaken`. */
export const CODE_MINT_ATTEMPTS = 8
/** Random part length of a code policy that names none. */
export const DEFAULT_CODE_LENGTH = 6
export const DEFAULT_PLUGIN_ORDER = 50
export const DEFAULT_PAGE_SIZE = 100
export const PLANNING_SCHEMA_VERSION = 1

export const TITLE_MAX = 2048
export const DESCRIPTION_MAX = 16384
export const CODE_MAX = 64
export const TYPE_MAX = 128
export const LABEL_MAX = 64
export const MAX_LABELS = 32
export const MAX_PARENTS = 32
export const BODY_MAX = 1_048_576
export const CAUSE_MAX = 256
export const KEY_MAX = 256
export const REF_MAX = 1024
export const QUERY_TEXT_MAX = 256
/** The longest list a wire query carries in one value (ids, parents). */
export const MAX_QUERY_LIST = 500

/**
 * The aliases one planning tree answers under, derived from the mount's base alias.
 *
 * Two mounts of the tree in one deployment are two base aliases, never two copies of this table —
 * which is why nothing here is a global constant.
 */
export const planningAliases = (base: string) => Object.freeze({
  base,
  schema: Object.freeze({ list: `${base}:schema:list` }),
  card: Object.freeze({
    list: `${base}:card:list`,
    summary: `${base}:card:summary`,
    get: `${base}:card:get`,
    transitions: `${base}:card:transitions`,
    specifications: `${base}:card:specifications`,
  }),
  spec: Object.freeze({
    get: `${base}:specification:get`,
    revisions: `${base}:specification:revisions`,
  }),
  link: Object.freeze({ list: `${base}:link:list` }),
  transition: Object.freeze({ get: `${base}:transition:get` }),
  execute: `${base}:execute`,
  commit: Object.freeze({ get: `${base}:commit:get`, events: `${base}:commit:events` }),
})
