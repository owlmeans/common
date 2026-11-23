import type { AreaKey } from '../areas/types.js'
import type { TaskOperationKind, TaskOperationStatus, TriageKind, WorkOutcome, WorkProposalKind, WorkProposalStatus } from './consts.js'

/** One member of a run, in the order the plan builds it. */
export interface WorkPlanMember {
  /** The member card's id. */
  card: string
  /** The member card's code — what a target file names. */
  code?: string
}

/**
 * A new member a planned run files before it builds it — what a standalone feature's scope draws
 * (`BAHelper.scopeFeature`). `card` and `code` are filled once the member is filed, so a resumed run
 * never files it twice.
 */
export interface WorkPlanDraft {
  /** Stable within the plan: `d-1`, `d-2`, … */
  ref: string
  /** The member's narrative, in the product's language. */
  narrative: string
  /** The member's area (the role it serves), by key. */
  area?: AreaKey
  /** The work type it is filed as — a user story when absent. */
  type?: string
  /** The card filed for it. */
  card?: string
  /** That card's code. */
  code?: string
}

/**
 * One piece a planned run changes: which card's work it belongs to, which part, and what changes.
 * Code fills `unit` with a card code; `part` is a piece identity of the registry or a piece kind.
 */
export interface WorkPlanTarget {
  /** The code of the card (the unit) the change serves. */
  unit: string
  /** The piece — a registry identity (`screen:orders-list`) or a piece kind (`api`). */
  part: string
  /** The file the piece lives in, when known. */
  path?: string
  /** What changes, in the product's language. */
  change: string
}

/** How one member or target of a run ended. */
export interface WorkPlanOutcome {
  /** The member card's id or a target's unit code. */
  card: string
  outcome: WorkOutcome
  /** Why, when it did not complete. */
  reason?: string
}

/**
 * A run's plan — the `plan` document of a work card (`WORK_PLAN_VERSION`).
 *
 * A spec's plan orders its members and records the decisions they share; an improvement's or a
 * standalone feature's plan selects the shortest set of steps from the engine's step catalogue and
 * the pieces they change. `steps` and `helpers` are catalogue keys, validated by the engine.
 */
export interface WorkPlan {
  version: number
  /** The members, in build order (a container's plan; the cards a planned run changes). */
  members?: WorkPlanMember[]
  /** New members the run files before it builds them (a standalone feature's scope). */
  drafts?: WorkPlanDraft[]
  /** The selected step keys, in catalogue order. */
  steps: string[]
  /** The pieces the run changes. */
  targets?: WorkPlanTarget[]
  /** The helper step keys the run adds (widget, requirements, task). */
  helpers?: string[]
  /** Why this plan — in the product's language. */
  rationale?: string
  /** The design decisions the members share (a spec's plan). */
  decisions?: string[]
  notes?: string[]
  /** How the members and targets ended, written as the run closes. */
  outcomes?: WorkPlanOutcome[]
}

/** One operation of a task — names, statuses, counts and backup ids; NEVER a value. */
export interface TaskOperation {
  /** Stable within the task: `op-1`, `op-2`, … */
  id: string
  kind: TaskOperationKind
  /** The variable's or secret's name, the table, the backup's label. */
  name: string
  status: TaskOperationStatus
  /** The backup taken before a change, or the one restored. */
  backupId?: string
  /** Rows read or changed. */
  rows?: number
  /** What happened, in the product's language — never a value. */
  note?: string
}

/** The `operations` document of a task card (`TASK_OPERATIONS_VERSION`). */
export interface TaskOperations {
  version: number
  operations: TaskOperation[]
}

/** What a task run reports back when it ends. */
export interface TaskReport {
  /** One paragraph, in the product's language. */
  summary: string
  operations: TaskOperation[]
  warnings?: string[]
}

/** One proposal on a card's `proposals` document. */
export interface WorkProposal {
  /** Stable within the document: `p-1`, `p-2`, … */
  id: string
  kind: WorkProposalKind
  title: string
  summary?: string
  /** The work type the proposed card would get. */
  type?: string
  /** Existing cards the proposal moves (ids). */
  cards?: string[]
  /** Stated requirement ids the proposal takes along. */
  requirements?: string[]
  status: WorkProposalStatus
  /** Why — the analysis's own reading. */
  reason?: string
}

/** The `proposals` document of a card (`WORK_PROPOSALS_VERSION`): a feature's focus split, a spec's derived members. */
export interface WorkProposals {
  version: number
  items: WorkProposal[]
}

/** One feature of a grouped spec: one capability for one role. */
export interface SpecGroupingFeature {
  title: string
  /** The role's area key. */
  area: AreaKey
  /** The capability, in one sentence. */
  capability: string
  /** The cards (codes, or draft references) it holds. */
  cards: string[]
}

/** One spec of a grouping answer. */
export interface SpecGroupingSpec {
  title: string
  summary: string
  /** The cards (codes, or draft references) it holds directly. */
  cards: string[]
  features: SpecGroupingFeature[]
}

/**
 * How coherent requirements are grouped into specs (init, conversion). A spec holds TWO OR MORE cards
 * the grouping judged coherent — never one; whatever it does not hold is loose.
 */
export interface SpecGrouping {
  specs: SpecGroupingSpec[]
  /**
   * The cards (codes, or draft references) no spec holds: a group of one, or a card the grouping judged
   * unrelated to the rest. Filed as themselves and implemented independently. Absent on a grouping
   * recorded before it was named — every card no spec names is loose then too.
   */
  loose?: string[]
}

/** Where one loose planned card goes on Run all. */
export interface LooseCardPlacement {
  /** The loose card's id. */
  card: string
  /** The existing container (spec or feature) id; `null` places it in the new spec. */
  container: string | null
  /** Its position among the container's members. */
  order: number
  reason?: string
}

/** The new spec a Run all files for the cards no existing container fits. */
export interface LooseCardNewSpec {
  title: string
  summary: string
}

/**
 * The architect's assignment of every loose planned card for Run all — existing specs run first, the new
 * spec after them, then the cards that run on their own.
 */
export interface LooseCardAssignment {
  /** The cards placed into a spec or a feature: an existing one, or the new spec (`container: null`). */
  placements: LooseCardPlacement[]
  /** Present when any placement goes to the new spec — formed only for two or more cards. */
  newSpec?: LooseCardNewSpec | null
  /**
   * The loose cards (ids) that run ON THEIR OWN — no spec is formed for them (a card fitting no
   * container and no other card) — after every spec, one by one, in this order.
   */
  loose?: string[]
}

/** A card free-flight triage files as the person's own. */
export interface TriageCardDraft {
  /** The work type; the type check decides when absent. */
  type?: string
  title: string
  description?: string
}

/** What free-flight triage decided about a request. */
export interface TriageResult {
  kind: TriageKind
  /** The cards to file — `card` only. */
  cards?: TriageCardDraft[]
  /** The person asked for the work to run at once. */
  runNow: boolean
  reason: string
}

/**
 * The type check's answer on a card's text: the work type that fits it better, and why. Both absent
 * when the card's type fits.
 */
export interface TypeFitAnswer {
  type?: string
  typeReason?: string
}
