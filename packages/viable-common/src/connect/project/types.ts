import type { ConnectTarget, ConnectWaitReason } from '../consts.js'
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
 */
export interface ConnectAgentLock {
  locked: boolean
  task?: string
  lockedAt?: string
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

export interface ConnectModifyBody {
  prompt: string
}

export interface ConnectRenameBody {
  /** The new product name. */
  name: string
  /** A new one-line description, when the person gave one. */
  description?: string
}
