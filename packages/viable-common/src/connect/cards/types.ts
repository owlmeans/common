import type { TaskOperationKind, TaskOperationStatus, TriageKind } from '../../work/consts.js'
import type { LooseCardAssignment, WorkPlan, WorkProposal } from '../../work/types.js'
import type { ConnectWaitReason } from '../consts.js'
import type { InquiryPayload } from '../ops/types.js'
import type { ConnectRunStatus } from '../project/types.js'
import type { WorkRerunScope } from '../../planning/consts.js'

/**
 * Run together through the connector (`connect.cards.together`) — the web's own body: the selected
 * cards (ids) become ONE new spec's members, and `start` starts the spec as the person's Start.
 */
export interface ConnectCardsTogetherBody {
  /** The cards to build together, by id — each a planned or failed work card of the project in no container. */
  cards: string[]
  /** Start the new spec at once (its gate's non-consuming check first). */
  start?: boolean
  /** The new spec's title; drawn from its members when absent. */
  title?: string
  /** An idempotency key: a repeated request files no second spec. Drawn from the selection when absent. */
  key?: string
}

/** What Run together did: the spec filed (or found again), its members, whether it was started. */
export interface ConnectCardsTogetherView {
  spec: string
  code?: string
  members: string[]
  started: boolean
}

/** One card as Run all's proposal names it. */
export interface ConnectCardsPlanCard {
  id: string
  code: string
  type: string
  title: string
}

/**
 * Run all's proposal (`connect.cards.plan`): where each loose planned card goes — the existing
 * containers in the order they run, the new spec after them, the cards that run on their own last —
 * with the cards and containers it names. Nothing is written by it.
 */
export interface ConnectCardsPlanView {
  assignment: LooseCardAssignment
  loose: ConnectCardsPlanCard[]
  containers: ConnectCardsPlanCard[]
}

/** Run all (`connect.cards.runAll`): the assignment the person accepted, applied, then one batch. */
export interface ConnectCardsRunAllBody {
  assignment: LooseCardAssignment
}

/**
 * Re-run a container's members (`connect.cards.rerun`) — the web's card menu body: the container (a
 * spec, a feature) is started as the person's own Start for exactly the members `scope` names.
 */
export interface ConnectCardsRerunBody {
  /** The container, by id. */
  card: string
  /** `failed` — only the failed members; `unfinished` — every member not completed. */
  scope: WorkRerunScope
}

/** What a re-run did: the container started, the members its run builds (ids), and the scope. */
export interface ConnectCardsRerunView {
  card: string
  code?: string
  scope: WorkRerunScope
  members: string[]
  started: boolean
}

/** The card a card route addresses, under its project. */
export interface ConnectCardParams {
  id: string
  cardId: string
}

/** A work card in a list — a container's member, a filed card. */
export interface ConnectCardBrief {
  id: string
  code: string
  /** The planning type key (`viable:user-story`, `viable:spec-card`, `viable:feature`, …). */
  type: string
  title: string
  status: string
}

/**
 * One input a task names — a configuration variable or a secret — and whether a value is set.
 * NEVER a value: a secret is typed into the task's secure input in the web application.
 */
export interface ConnectCardInput {
  name: string
  kind: TaskOperationKind.Variable | TaskOperationKind.Secret
  /** Where the task's operation for it stands. */
  status: TaskOperationStatus
  /** A non-empty value is stored for the name. */
  set: boolean
}

/**
 * One work card of any type composed with what a parent needs about it (`connect.cards.status`):
 * the card, a container's members, its plan and open proposals, a task's inputs as set or missing
 * with the link to its secure input, and the card's own run.
 */
export interface ConnectCardStatus {
  projectId: string
  card: ConnectCardBrief & {
    intrinsic: string
    description?: string
    warning?: string
    /** The container (a spec or a feature) the card is a member of. */
    container?: string
    /** Who decided the type — `person` or `model`. */
    typeBy?: string
  }
  /** A container's members, in board order. */
  members?: ConnectCardBrief[]
  /** The card's plan document — a spec's member order and shared decisions, a planned run's steps. */
  plan?: WorkPlan
  /** The card's proposals still open — accepted or dismissed through `update_card`. */
  proposals?: WorkProposal[]
  /** A task's inputs — names and whether each is set, never a value. */
  inputs?: ConnectCardInput[]
  /** Where the person types a task's secrets: the card's Task inputs tab in the web application. */
  inputsUrl?: string
  /** The card's own run (`story:` / `spec:` / `work:` / `task:` `<cardId>`). */
  run?: ConnectRunStatus
  waitingFor?: ConnectWaitReason
  pendingInquiry?: InquiryPayload
  updatedAt: string
}

/** A card a request filed. */
export interface ConnectRequestCard {
  id: string
  code: string
  type: string
  title: string
}

/** The person's gated start a request asked for, once the cards were filed. */
export interface ConnectRequestStart {
  /** The card started — the spec when one was filed, else the one card. */
  card: string
  started: boolean
  /** The refusal's marker when the start was refused (the balance, the plan, a run already going). */
  refusal?: string
}

/**
 * What a request (`connect.project.request`) became: a question answered by reading, a small fix the
 * agent makes now, or cards filed as the person's own — and, when asked, the start of the filed work.
 */
export interface ConnectRequestView {
  kind: TriageKind
  /** The cards filed — `card` only. */
  cards?: ConnectRequestCard[]
  /** The start the request asked for (`runNow`) — `card` only. */
  start?: ConnectRequestStart
}
