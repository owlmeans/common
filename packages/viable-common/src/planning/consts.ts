import { CodeScope, CodeStyle, type CodePolicy } from '@owlmeans/planning'

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
export const VIABLE_USER_STORY_TYPE = 'viable:user-story'
/**
 * A spec CARD — a container of work built together in one pass. Not `viable:spec`, which is the type
 * of every DOCUMENT a card carries.
 */
export const VIABLE_SPEC_CARD_TYPE = 'viable:spec-card'
/** A feature — one capability for one role; a container of the stories, improvements and tasks that build it. */
export const VIABLE_FEATURE_TYPE = 'viable:feature'
/** A task — work with no code: configuration, variables, secrets, data changes, backups. */
export const VIABLE_TASK_TYPE = 'viable:task'
/** Every document a project or story card carries (specification, vision, design system, plans). */
export const VIABLE_SPEC_TYPE = 'viable:spec'

/** An improvement — a planned change to what exists, built from the shortest set of story steps. */
export const VIABLE_IMPROVEMENT_TYPE = 'viable:improvement'

/**
 * Reserved card types. Declared in full so their code prefix and flow are decided once, and
 * deliberately absent from the project type's `cardTypes`: nothing may create one yet.
 */
export const VIABLE_BUG_TYPE = 'viable:bug'
export const VIABLE_REQUIREMENT_TYPE = 'viable:requirement'

/**
 * Every kind of WORK card — what a person creates, starts and retypes on the board. All five run the
 * one work flow ({@link VIABLE_WORK_FLOW}) and carry the same document slots, so a retype never
 * orphans a status or a document.
 */
export const VIABLE_WORK_TYPES: readonly string[] = Object.freeze([
  VIABLE_USER_STORY_TYPE, VIABLE_SPEC_CARD_TYPE, VIABLE_FEATURE_TYPE, VIABLE_IMPROVEMENT_TYPE, VIABLE_TASK_TYPE,
])

/**
 * The work cards that hold members: a spec (features, stories, improvements, tasks — another spec by
 * the schema only, the board refuses it) and a feature (stories, improvements, tasks). The project
 * stays a member's primary parent; the container is its second `parents` entry.
 */
export const VIABLE_CONTAINER_TYPES: readonly string[] = Object.freeze([VIABLE_SPEC_CARD_TYPE, VIABLE_FEATURE_TYPE])

/** The work cards that hold nothing. */
export const VIABLE_LEAF_TYPES: readonly string[] = Object.freeze([VIABLE_USER_STORY_TYPE, VIABLE_IMPROVEMENT_TYPE, VIABLE_TASK_TYPE])

/** What a spec card may hold. */
export const VIABLE_SPEC_CARD_MEMBERS: readonly string[] = Object.freeze([
  VIABLE_FEATURE_TYPE, VIABLE_USER_STORY_TYPE, VIABLE_IMPROVEMENT_TYPE, VIABLE_TASK_TYPE, VIABLE_SPEC_CARD_TYPE,
])

/** What a feature may hold. */
export const VIABLE_FEATURE_MEMBERS: readonly string[] = Object.freeze([VIABLE_USER_STORY_TYPE, VIABLE_IMPROVEMENT_TYPE, VIABLE_TASK_TYPE])

export const VIABLE_PROJECT_FLOW = 'viable:project'
export const VIABLE_WORKCARD_FLOW = 'viable:user-story'
/**
 * The flow every work card runs. Its id stays `viable:user-story` — every card's `flows` map stores
 * it — so this is the same value under the name that reads right for a spec, a feature or a task.
 */
export const VIABLE_WORK_FLOW = VIABLE_WORKCARD_FLOW
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
export enum ViableWorkcardStatus {
  Planned = 'planned',
  InProgress = 'in-progress',
  Completed = 'completed',
  /** Intrinsically PLANNED: a failed story is work still to do, and retrying it is `start`. */
  Failed = 'failed',
}

export enum ViableWorkcardTransition {
  /** `planned | failed → in-progress` — the only move that asks for development. */
  Start = 'start',
  Complete = 'complete',
  Fail = 'fail',
  /** `* → planned` — the manual recovery, and the one move a completed story still accepts. */
  Reset = 'reset',
}

/**
 * Which members of a container (a spec, a feature) a person's re-run builds again — the card menu's
 * Re-run failed and Run unfinished, the connector's `rerun_card`. A wire value: never renamed.
 */
export enum WorkRerunScope {
  /** Only the members whose status is `failed`. */
  Failed = 'failed',
  /** Every member not completed — planned (never run, or reset by a stop) and failed. */
  Unfinished = 'unfinished',
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
 * Project: `specification`, `vision`, `design-system` (the brief), `scaffold` (the drawn plan) and
 * `requirements` (every stated requirement and the story codes it applies to). Every work card:
 * `design` and `requirements` (its slice, plus the ones quoted from a person's own text), `plan`,
 * `operations` and `proposals` — one set for every work type, so a retype never orphans a document.
 * The co-located
 * `*.spec/.ux/.ui.md` files of a target are FILES, not slots — that prose already lives inside the
 * `design` payload — so `SpecCategory` is not a slot vocabulary.
 */
export enum ViableSpecCategory {
  Specification = 'specification',
  Vision = 'vision',
  DesignSystem = 'design-system',
  Scaffold = 'scaffold',
  Design = 'design',
  Requirements = 'requirements',
  /** A work card's run plan (`WorkPlan`): ordered members, steps, shared decisions, outcomes. */
  Plan = 'plan',
  /** A task's operations (`TaskOperations`): names, statuses, backup ids — never values. */
  Operations = 'operations',
  /** What a review proposes (`WorkProposals`): a feature's focus split, a spec's derived members. */
  Proposals = 'proposals',
}

/** How many revisions of a `design`, `scaffold` or `requirements` document the history must be able to answer. */
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

/** Who decided a work card's type: the person (an explicit choice, respected until the text changes) or the type check. */
export enum ViableTypeBy {
  Person = 'person',
  Model = 'model',
  /**
   * A create's MARKER, never a stored decision: the person left the type to the type check. A connector
   * create carries it to ask for the type check the connect channel otherwise skips (a legacy story tool
   * files what it names); the format rule files the card `model`.
   */
  Auto = 'auto',
}

/** The longest `fields.typeReason` a card keeps — why the type check retyped it, one or two sentences. */
export const VIABLE_TYPE_REASON_MAX = 1024

/**
 * What a project's confirm asks the initialization to do — the choice at the specification approval:
 * draw the application for the preview only, or also implement its first spec right away. Carried
 * on the confirm transit's `changes.fields.initScope` (and so kept on the project card); absent is
 * the preview, as every confirm before the choice existed.
 */
export enum ViableInitScope {
  Preview = 'preview',
  Implement = 'implement',
}

/**
 * The choice a confirm REQUEST carries (the manager's confirm body, the connector's
 * `confirmImplementation`): the preview only, or the spec implemented right away. Stored on the
 * project card as its {@link ViableInitScope} (`spec` → `implement`).
 */
export enum ViableImplementChoice {
  Preview = 'preview',
  Spec = 'spec',
}

/** Where a spec card came from. */
export enum ViableSpecOrigin {
  /** A person created it on the board. */
  Person = 'person',
  /** The initialization grouped the project's first stories into it. */
  Init = 'init',
  /** A conversion grouped the converted stories into it. */
  Conversion = 'conversion',
  /** A person ran several cards together. */
  Together = 'together',
  /** Run all placed the loose cards no existing container fitted into it. */
  RunAll = 'run-all',
  /** Free-flight triage filed it. */
  Triage = 'triage',
}

/** The channels a PERSON writes through. */
export const VIABLE_USER_CHANNELS: readonly string[] = Object.freeze([
  ViableChannel.Web, ViableChannel.Connect,
])

export const VIABLE_USER_STORY_CODE_PREFIX = 'US-'
export const VIABLE_SPEC_CARD_CODE_PREFIX = 'SPEC-'
export const VIABLE_FEATURE_CODE_PREFIX = 'FEAT-'
export const VIABLE_TASK_CODE_PREFIX = 'TASK-'
export const VIABLE_BUG_CODE_PREFIX = 'BUG-'
export const VIABLE_IMPROVEMENT_CODE_PREFIX = 'IMP-'
export const VIABLE_REQUIREMENT_CODE_PREFIX = 'REQ-'
export const VIABLE_CARD_CODE_LENGTH = 5

/** `US-` + five uppercase characters, unique within the project. The code a target is keyed by. */
export const VIABLE_USER_STORY_CODE: CodePolicy = Object.freeze({
  prefix: VIABLE_USER_STORY_CODE_PREFIX,
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

/** `SPEC-` + five uppercase characters, unique within the project. */
export const VIABLE_SPEC_CARD_CODE: CodePolicy = Object.freeze({
  ...VIABLE_USER_STORY_CODE, prefix: VIABLE_SPEC_CARD_CODE_PREFIX,
})

/** `FEAT-` + five uppercase characters, unique within the project. */
export const VIABLE_FEATURE_CODE: CodePolicy = Object.freeze({
  ...VIABLE_USER_STORY_CODE, prefix: VIABLE_FEATURE_CODE_PREFIX,
})

/** `TASK-` + five uppercase characters, unique within the project. */
export const VIABLE_TASK_CODE: CodePolicy = Object.freeze({
  ...VIABLE_USER_STORY_CODE, prefix: VIABLE_TASK_CODE_PREFIX,
})

export const VIABLE_BUG_CODE: CodePolicy = Object.freeze({
  ...VIABLE_USER_STORY_CODE, prefix: VIABLE_BUG_CODE_PREFIX,
})

export const VIABLE_IMPROVEMENT_CODE: CodePolicy = Object.freeze({
  ...VIABLE_USER_STORY_CODE, prefix: VIABLE_IMPROVEMENT_CODE_PREFIX,
})

export const VIABLE_REQUIREMENT_CODE: CodePolicy = Object.freeze({
  ...VIABLE_USER_STORY_CODE, prefix: VIABLE_REQUIREMENT_CODE_PREFIX,
})

/**
 * The sentence a landing story's narrative carries — what a person reading the board sees.
 *
 * The AUTHORITY is the card's `fields.landing` flag, never this text: the design and development
 * stages key on the flag, and a person may reword the narrative at any time. The sentence exists so
 * the board says in plain words why this story is different, and so the analyst and the designer,
 * who read the narrative, write a screen that continues what the guest started.
 *
 * A constant, byte for byte, because {@link hasLandingSentence} is how a resumed decision step
 * knows it already appended it.
 */
export const LANDING_USER_STORY_SENTENCE = 'A visitor can start this on the landing page without an account;'
  + ' after signing in they continue here with their choices carried over.'
