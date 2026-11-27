import type { AgentStopScope } from '../../batch/consts.js'
import type { CatalogueChoice } from '../../stack/choice/types.js'
import type { ViableImplementChoice } from '../../planning/consts.js'
import type { StructurePartKind } from '../../topology/structure/consts.js'
import type { ProjectStructure, StructureChange, StructureIssue } from '../../topology/structure/types.js'
import type { ConnectTarget, ConnectWaitReason } from '../consts.js'
import type { ConnectMaterialsAnnouncement } from '../materials/types.js'
import type { InquiryPayload } from '../ops/types.js'
import type { ConnectSessionView } from '../session/types.js'
import type { ConnectSlotState } from '../slot/types.js'

export interface ConnectRunStatus {
  runId: string
  pipeline: string
  status: string
  step?: string
  completed: string[]
  pending: string[]
  warnings?: string[]
  error?: string
  startedAt?: string
  updatedAt?: string
}

/** What a connector needs to know about a project in one call. */
export interface ConnectProjectStatus {
  /**
   * The project card, flattened into the names a parent agent already reads.
   *
   * `name` is the card's `title` and `alias` its `code`; the three brief parts are the bodies of
   * the project's `specification`, `vision` and `design-system` specifications. `status` and
   * `intrinsic` are the card's own — a key of the project flow and the intrinsic state it maps to —
   * typed as plain strings because this view crosses a version skew and a newer platform may
   * answer with a status an older connector has never heard of.
   */
  project: {
    id: string
    name: string
    alias: string
    description?: string
    status: string
    intrinsic: string
    specification?: string
    vision?: string
    designSystem?: string
  }
  slot?: ConnectSlotState
  production?: { id: string, status: string, host?: string }
  agent: ConnectAgentLock
  run?: ConnectRunStatus
  waitingFor?: ConnectWaitReason
  pendingInquiry?: InquiryPayload
  session?: ConnectSessionView
  /** Set for a local target: the connector should not offer cloud-only operations. */
  local: boolean
  updatedAt: string
}

/**
 * The project's agent lock as a connector reads it — held while a run, a conversion stage or a
 * kit apply works on the project. `task` and `lockedAt` are set only while it is held.
 *
 * The controls a person has over the run that holds it ride along, each set only while it applies:
 * `stopping` once a stop was requested (with the story it is meant for and its scope), and
 * `steerable` while the run accepts messages (`connect.project.steer`). It is also what
 * `connect.project.stop` answers.
 */
export interface ConnectAgentLock {
  locked: boolean
  task?: string
  lockedAt?: string
  stopping?: boolean
  stoppingStoryId?: string
  stopScope?: AgentStopScope
  steerable?: boolean
}

/** A story card composed with its deterministic development run. */
export interface ConnectStoryStatus {
  projectId: string
  story: {
    id: string
    code: string
    title: string
    status: string
    intrinsic: string
    warning?: string
  }
  run?: ConnectRunStatus
  waitingFor?: ConnectWaitReason
  pendingInquiry?: InquiryPayload
  updatedAt: string
}

/** The record a local project keeps so a later session knows what it is. */
export interface ConnectMarker {
  version: 1
  apiUrl: string
  projectId: string
  slug: string
  entitySlug?: string
  createdAt: string
}

/** The deliberate small projection returned by the connector project list. */
export interface ConnectProjectSummary {
  id: string
  name: string
  alias: string
}

/** Attach an existing project to a session. */
export interface ConnectAttachBody {
  projectId?: string
  slug?: string
  projectDir?: string
}

/** Create a project through the connector; `target` decides where its tree will live. */
export interface ConnectCreateBody {
  prompt: string
  target?: ConnectTarget
  /**
   * The caller's unattached delegated session; its pre-card checks are performed by that session's
   * parent. Absent, the platform performs them.
   */
  sessionId?: string
}

/**
 * Create a project with the person's choice made BEFORE the specification
 * (`connect.project.createWithChoice`): the create body, the {@link CatalogueChoice} keys — the
 * blueprint, the case and its category, a bot's platforms, the tenancy flags; each absent is Auto, the
 * classifier's — whether to stop at the structure step, and the files the connector is about to upload
 * when it has any (as `ConnectCreateWithMaterialsBody` announces them). The prompt's references are
 * read as `createWithReferences` reads them. The choice keys are the registry's words: a connector
 * tool's `blueprint` argument travels as `case`, its `case` argument as `category`, and no stack is sent
 * ({@link CatalogueChoice}).
 */
export interface ConnectCreateWithChoiceBody extends ConnectCreateBody, CatalogueChoice {
  /**
   * Stop at the structure step for the person (`connect.project.structure.*`) before the specification
   * is written — honoured where the environment lets a creation stop. Absent or `false`: the proposed
   * structure is applied and the drafting goes on.
   */
  reviewStructure?: boolean
  /** The files the connector is about to upload with the prompt; absent, the project waits for none. */
  materials?: ConnectMaterialsAnnouncement
}

/** The classifier's different case, beside the person's own. */
export interface ConnectStructureSuggestion {
  choice: CatalogueChoice
  /** Why, one or two sentences in the project's language. */
  rationale: string
}

/** The structure an advice round proposed: what it is, why and what it changed from the edited one. */
export interface ConnectStructureProposal {
  structure: ProjectStructure
  rationale: string
  /** What changed from the structure the round was asked over (`projectStructureHelper.diff`). */
  changes: StructureChange[]
}

/**
 * A project's structure as a connector reads it (`connect.project.structure.get`): during a creation's or
 * a conversion's structure step the platform's preliminary record, after the initialization the project
 * card's own structure (`status` `specified`). Never how many advice rounds ran: that stays on the server.
 */
export interface ConnectProjectStructure {
  projectId: string
  /** `creation` or `conversion` (`ConnectStructureOrigin`) — a conversion's step takes no advice round. */
  origin: string
  /** Where the step stands (`ConnectStructureStatus`): only `awaiting` takes a submission. */
  status: string
  /** What a submission names — every write is compare-and-set on it; `0` for a project card's. */
  revision: number
  /**
   * The blueprint and case in force — the person's, settled, else the classifier's — in the registry's
   * words: a connector tool presents `case` as the blueprint and `category` as the case, the stack unsaid.
   */
  choice: CatalogueChoice
  /** The classifier's different case when the person chose another; absent when it agreed or was not asked. */
  suggestion?: ConnectStructureSuggestion
  /** The structure in force. */
  structure: ProjectStructure
  /** The latest advised structure and its changes, while the person has not taken or undone it. */
  proposal?: ConnectStructureProposal
  /** What `structure` breaks for this environment's kinds; `[]` for a valid one. */
  issues: StructureIssue[]
  /** The part kinds this environment enabled — a part of any other kind is refused. */
  kinds: StructurePartKind[]
  /** The ideas texts the person added, oldest first. */
  ideas: string[]
  /** Why the last step failed — a refusal marker. */
  lastError?: string
  /** Why the content gate refused the person's words — a refusal marker. */
  refusal?: string
  /**
   * Shown, never edited: a conversion repairing a Viable tree in place keeps the tree's own topology and
   * the case its seeds carry — a submission is refused, and the conversion continues as it stands.
   */
  readonly?: boolean
}

/**
 * What a connector submits from the structure step (`connect.project.structure.submit`): the revision it
 * read, and what it changed. An ADVICE round — `advise`, or an ideas text (its links read too) — asks
 * the platform to propose an updated structure over the edit: model work billed as part of the
 * initialization, refused with `ConnectConfirmationRequired` unless `confirm` says a person agreed. A
 * submission without either takes the structure and continues — to the specification for a creation.
 */
export interface ConnectStructureSubmitBody {
  /** The view's `revision` the edit was made over — a stale one is refused. */
  revision: number
  /**
   * The blueprint and case as the person chose them, in the registry's words (a tool's `blueprint` is
   * `case`, its `case` is `category`); absent keeps the person's earlier choice (Auto where none).
   */
  choice?: CatalogueChoice
  /** The structure as edited, every part with its purpose; absent keeps the one in force. */
  structure?: ProjectStructure
  /** Ask the platform to advise an updated structure after the edit. */
  advise?: boolean
  /** The person's ideas — text and links — the advice round reads. */
  ideas?: string
  /** A person agreed to what an advice round spends. */
  confirm?: boolean
}

/**
 * Confirm a drafted project, optionally editing what the analysis produced.
 *
 * The keys are a parent agent's vocabulary and stay as they are: `name` becomes the card's
 * `title`, and each brief part present is written into the project's specification of that
 * category before the confirm transition runs.
 */
export interface ConnectConfirmBody {
  name?: string
  description?: string
  specification?: string
  vision?: string
  designSystem?: string
  target?: ConnectTarget
}

/**
 * A confirm that carries the choice at the specification approval (`connect.project.confirmImplementation`):
 * `preview` draws the application only (what every other confirm does), `spec` also implements the
 * init's spec right away — asked of the spec gate at the confirm.
 */
export interface ConnectConfirmImplementationBody extends ConnectConfirmBody {
  implement: ViableImplementChoice
}

export interface ConnectModifyBody {
  prompt: string
}

export interface ConnectRenameBody {
  /** The new product name. */
  name: string
  /** A new one-line description, when the person gave one. */
  description?: string
}
