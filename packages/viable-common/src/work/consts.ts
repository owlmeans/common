/**
 * The work-card documents and the shapes the engine and the platform exchange about a work card
 * (Uroboros D): a run's plan, a task's operations, the proposals a review files, and the answers
 * of the grouping, assignment, triage and type-fit steps.
 */

/** The `plan` document's body version (`WorkPlanSchema`). A stored plan of another version reads as absent. */
export const WORK_PLAN_VERSION = 1

/** The `operations` document's body version (`TaskOperationsSchema`). */
export const TASK_OPERATIONS_VERSION = 1

/** The `proposals` document's body version (`WorkProposalsSchema`). */
export const WORK_PROPOSALS_VERSION = 1

/** The longest step or helper key a plan names (a key of the engine's step catalogue). */
export const WORK_STEP_KEY_MAX = 64

/** The most steps, helpers, targets or members one plan carries. */
export const WORK_PLAN_LIST_MAX = 64

/** The longest free text a plan, an operation, a proposal or an answer carries in one field. */
export const WORK_TEXT_MAX = 4000

/** The longest name or title a work document carries. */
export const WORK_NAME_MAX = 256

/** The most operations one task records. */
export const TASK_OPERATIONS_MAX = 64

/** The most proposals one card keeps. */
export const WORK_PROPOSALS_MAX = 32

/** The most specs one grouping answer files. */
export const SPEC_GROUPING_MAX = 24

/** The most cards one triage answer files. */
export const TRIAGE_CARDS_MAX = 8

/** How a member of a run or a planned target ended. */
export enum WorkOutcome {
  Completed = 'completed',
  Failed = 'failed',
  /** Dropped by the run (a unit failing at design) — the others went on. */
  Dropped = 'dropped',
  /** Not reached: the run stopped before it. */
  Skipped = 'skipped',
}

/**
 * What one batch of a container's implementation plan runs (`WorkPlanBatch.kind`): a combined pass over
 * user stories, features and the container's own requirements; the planned run of improvements; or task runs.
 */
export enum WorkBatchKind {
  /** ONE combined design + implement pass over its units (a lone unit: that card's own run). */
  Pass = 'pass',
  /** The improvements, planned each on its own document and built together in one planned run. */
  Improvements = 'improvements',
  /** Task runs, one after another — no code. */
  Tasks = 'tasks',
}

/** What one task operation does. Never a value — only names, counts and backup ids are recorded. */
export enum TaskOperationKind {
  /** A configuration variable set or cleared (`agent.config.apply`). */
  Variable = 'variable',
  /** A secret requested from the person (typed into the task's input dialog, never into a document). */
  Secret = 'secret',
  /** A read of the preview database. */
  DatabaseRead = 'database-read',
  /** One data change of the preview database (DML only, behind a backup). */
  DatabaseChange = 'database-change',
  /** A backup of the preview database's application data. */
  BackupCreate = 'backup-create',
  /** A restore of a backup. */
  BackupRestore = 'backup-restore',
  /** A question the task waits on (the Waiting status). */
  Question = 'question',
}

/** Where one task operation stands. */
export enum TaskOperationStatus {
  Planned = 'planned',
  /** Waiting on the person — a secret to type, a confirmation to give. */
  Waiting = 'waiting',
  Done = 'done',
  Failed = 'failed',
  /** Refused by a safety rule (DDL, a row cap, the production database). */
  Refused = 'refused',
  Skipped = 'skipped',
}

/** What a proposal on a card's `proposals` document suggests. */
export enum WorkProposalKind {
  /** A feature's focus split: move a requirement or a capability out into a card of its own. */
  Focus = 'focus',
  /** A member a spec created empty should hold. */
  Member = 'member',
}

/** Where a proposal stands — the person accepts or dismisses it. */
export enum WorkProposalStatus {
  Open = 'open',
  Accepted = 'accepted',
  Dismissed = 'dismissed',
}

/** What free-flight triage made of a request. */
export enum TriageKind {
  /** A question: a read-only answer. */
  Question = 'question',
  /** A small fix: today's free flight. */
  Fix = 'fix',
  /** Work for one or more cards, filed as the person's own. */
  Card = 'card',
  /**
   * A change of the project's APPLICATION STRUCTURE — an app added, an area added to an app or moved
   * to another one, an app renamed or remounted: free flight with its app tools, never cards. The
   * features a request names inside that structure are filed by the run as planned stories after it.
   * The connector's `request` answers it as `fix` (free flight runs): its wire knows no other kind.
   */
  Apps = 'apps',
}
