import { CodeScope, CodeStyle } from '@owlmeans/planning'
import type { CodePolicy } from '@owlmeans/planning'

/**
 * The OwlMeans Viable vocabulary over `@owlmeans/planning`.
 *
 * A project, a user story and the documents behind them are planning WORKCARDS of the types
 * declared here. Everything generic — the record, the transition, the fold, the store, the protocol
 * tree — belongs to the planning packages; what a Viable project or story IS, which statuses it
 * moves through and which documents it carries, is declared once in this module and read by every
 * runtime that writes one.
 */

/** A Viable project — the card every story, document and platform record of a product hangs under. */
export const VIABLE_PROJECT_TYPE = 'viable:project'
/** A user story — the unit of development a person starts. */
export const VIABLE_STORY_TYPE = 'viable:user-story'
/** Every document a project or story card carries (specification, vision, design system, plans). */
export const VIABLE_SPEC_TYPE = 'viable:spec'

/**
 * Reserved card types. Declared in full so their code prefix and flow are decided once, and
 * deliberately absent from the project type's `cardTypes`: nothing may create one yet.
 */
export const VIABLE_BUG_TYPE = 'viable:bug'
export const VIABLE_IMPROVEMENT_TYPE = 'viable:improvement'
export const VIABLE_REQUIREMENT_TYPE = 'viable:requirement'

export const VIABLE_PROJECT_FLOW = 'viable:project'
export const VIABLE_STORY_FLOW = 'viable:user-story'
/** The one-status flow a document runs — a specification has no lifecycle of its own. */
export const VIABLE_SPEC_FLOW = 'viable:spec'

/**
 * The story flow's status keys.
 *
 * Byte-identical to the strings a story has always carried — the frontmatter of
 * `docs/stories/<code>.md`, connector status rendering, the board's columns, their i18n
 * keys and every end-to-end selector read these exact values. A key is a wire contract and is
 * never renamed.
 */
export enum ViableStoryStatus {
  Planned = 'planned',
  InProgress = 'in-progress',
  Completed = 'completed',
  /** Intrinsically PLANNED: a failed story is work still to do, and retrying it is `start`. */
  Failed = 'failed',
}

export enum ViableStoryTransition {
  /** `planned | failed → in-progress` — the only move that asks for development. */
  Start = 'start',
  Complete = 'complete',
  Fail = 'fail',
  /** `* → planned` — the manual recovery, and the one move a completed story still accepts. */
  Reset = 'reset',
}

export enum ViableProjectStatus {
  /** Created from a prompt, specification drafted, nothing provisioned. */
  Draft = 'draft',
  /** The owner confirmed the brief; initialization is running or has run. */
  Confirmed = 'confirmed',
  /** Initialization finished at least once. */
  Active = 'active',
  Archived = 'archived',
}

export enum ViableProjectTransition {
  Confirm = 'confirm',
  Activate = 'activate',
  Archive = 'archive',
  Reopen = 'reopen',
}

/** The single status a document holds. */
export enum ViableSpecStatus {
  Current = 'current',
}

/** The palette key a board renders a status with. Presentation data, carried on the flow. */
export enum ViableTone {
  Blue = 'blue',
  Yellow = 'yellow',
  Green = 'green',
  Red = 'red',
  Neutral = 'neutral',
}

/**
 * The specification slots Viable cards carry.
 *
 * Project: `specification`, `vision`, `design-system` (the brief) and `scaffold` (the drawn plan).
 * Story: `design`. The co-located `*.spec/.ux/.ui.md` files of a target are FILES, not slots — that
 * prose already lives inside the `design` payload — so `SpecCategory` is not a slot vocabulary.
 */
export enum ViableSpecCategory {
  Specification = 'specification',
  Vision = 'vision',
  DesignSystem = 'design-system',
  Scaffold = 'scaffold',
  Design = 'design',
}

/** How many revisions of a `design` or `scaffold` document the history must be able to answer. */
export const VIABLE_DESIGN_REVISIONS_KEPT = 3

/**
 * Relationship types between story cards.
 *
 * `follows` is WRITTEN: a connective story follows the flow story it was anchored after, created in
 * the same transition as the card. `shares-widget` and `shares-screen` are DECLARED ONLY — the
 * `scaffold` specification is their single authority, and a second copy as links would be a second
 * answer that can disagree with it.
 */
export enum ViableRelationship {
  Follows = 'follows',
  SharesWidget = 'shares-widget',
  SharesScreen = 'shares-screen',
}

/**
 * Where a write came from, carried on `PlanningScope.channel` and recorded on the transition's
 * `actor.channel`.
 *
 * It is never read from the wire: the manager API derives `Connect` from an access-token request
 * and `Web` from everything else; the agent writes as `Agent` or `Pipeline`. Three rules key on it
 * — the balance refusal class (`ConnectOutOfCredits` for `Connect`), re-formatting a narrative
 * (`Web`/`Connect` only), and the develop trigger (a committed `start` by `Web`/`Connect` only).
 */
export enum ViableChannel {
  Web = 'web',
  Connect = 'connect',
  Agent = 'agent',
  Pipeline = 'pipeline',
}

/** The channels a PERSON writes through. */
export const VIABLE_USER_CHANNELS: readonly string[] = Object.freeze([
  ViableChannel.Web, ViableChannel.Connect,
])

export const VIABLE_STORY_CODE_PREFIX = 'US-'
export const VIABLE_BUG_CODE_PREFIX = 'BUG-'
export const VIABLE_IMPROVEMENT_CODE_PREFIX = 'IMP-'
export const VIABLE_REQUIREMENT_CODE_PREFIX = 'REQ-'
export const VIABLE_CARD_CODE_LENGTH = 5

/** `US-` + five uppercase characters, unique within the project. The code a target is keyed by. */
export const VIABLE_STORY_CODE: CodePolicy = Object.freeze({
  prefix: VIABLE_STORY_CODE_PREFIX,
  style: CodeStyle.Random,
  length: VIABLE_CARD_CODE_LENGTH,
  uppercase: true,
  uniqueWithin: CodeScope.Parent,
})

/**
 * A project's code is its alias — a slug unique within the organization.
 *
 * Minted by the platform's name ladder, which knows about retired aliases and refused hostnames;
 * a code policy only guards uniqueness, so a create always supplies the code.
 */
export const VIABLE_PROJECT_CODE: CodePolicy = Object.freeze({
  style: CodeStyle.Slug,
  uniqueWithin: CodeScope.Entity,
  // The alias moves: a rename changes it, and a refused preview certificate walks it to `alias-2`.
  // A story code never moves — the target's files are named after it.
  mutable: true,
})

export const VIABLE_BUG_CODE: CodePolicy = Object.freeze({
  ...VIABLE_STORY_CODE, prefix: VIABLE_BUG_CODE_PREFIX,
})

export const VIABLE_IMPROVEMENT_CODE: CodePolicy = Object.freeze({
  ...VIABLE_STORY_CODE, prefix: VIABLE_IMPROVEMENT_CODE_PREFIX,
})

export const VIABLE_REQUIREMENT_CODE: CodePolicy = Object.freeze({
  ...VIABLE_STORY_CODE, prefix: VIABLE_REQUIREMENT_CODE_PREFIX,
})
