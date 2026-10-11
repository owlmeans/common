import type {
  ArchitectureCase, ConversionDecision, ConversionStage, ConversionStatus, ConvertibilityReason,
  ConvertibilityVerdict, OriginKind, OriginShape, OriginState
} from '../../convert/consts.js'
import type { ConversionEstimate, StoryEstimateBand } from '../../convert/estimate/types.js'
import type { ConversionStackRef } from '../../convert/record/types.js'
import type { ConnectTarget, ConnectWaitReason } from '../consts.js'
import type { InquiryPayload } from '../ops/types.js'

/** Start a conversion of an existing project's code. */
export interface ConnectConvertCreateBody {
  name?: string
  about?: string
  /** Where the converted target's tree will live. */
  target?: ConnectTarget
  /**
   * Where the code comes from.
   *
   * Absent for a LOCAL target the connector is already attached to: the tree is the directory the
   * session opened on, and there is nothing to fetch.
   */
  origin?: { kind: OriginKind, repoUrl?: string, branch?: string }
  /**
   * The caller's unattached delegated session; its pre-card checks are performed by that session's
   * parent. Absent, the platform performs them.
   */
  sessionId?: string
}

/**
 * Start the conversion of a project already filed.
 *
 * `confirm` says a PERSON agreed to what the start uses: without it, a start that would spend the
 * organization's `conversions` unit is refused with `ConnectConfirmationRequired` and nothing runs.
 * A delegated conversion spends nothing and is never asked.
 */
export interface ConnectConvertStartBody {
  confirm?: boolean
}

/** Decide what happens at a stage boundary. */
export interface ConnectConvertProceedBody {
  decision: ConversionDecision
  /** Free text the user added to the decision; recorded, never parsed. */
  note?: string
  /**
   * A person agreed to what the stage costs. Without it, a stage that would spend credit limits or
   * topped-up credits (its estimate past what is left of the conversion limit) is refused with
   * `ConnectConfirmationRequired` — its estimate split packed — and nothing runs.
   */
  confirm?: boolean
  /**
   * The person's edits to what the analysis drafted, written before the stage starts — accepted
   * only with the decision that starts the EXTRACTION, the stage that classifies the text again.
   * Refused with any other decision, because an edit no moderation check will read must not drive
   * the stories generated from it.
   */
  update?: ConnectConvertProceedUpdate
}

/**
 * What a person may change on a conversion before its extraction — the project's name and
 * description and its three brief parts. Never its alias: the preview hostname, the slot and the
 * OIDC client were composed from it at import.
 */
export interface ConnectConvertProceedUpdate {
  name?: string
  description?: string
  specification?: string
  vision?: string
  designSystem?: string
}

/**
 * Whether this origin can be converted, and what it will cost.
 *
 * Answered BEFORE anything is provisioned or charged, from the census alone — which is why it
 * carries the counts it was decided from rather than a bare verdict.
 */
export interface ConvertCheck {
  projectId: string
  verdict: ConvertibilityVerdict
  reasons: ConvertibilityReason[]
  stack?: ConversionStackRef
  architecture?: ArchitectureCase
  shape: OriginShape
  monorepo: boolean
  /** Workspace members and directories nothing declares. Named, because each one is a decision. */
  unlinked: string[]
  files: number
  bytes: number
  /** Bulk data files found — sampled and described, never carried. */
  bulk: number
  estimate?: ConversionEstimate
}

/** Everything a caller needs to draw the conversion's current state in one call. */
export interface ConversionStatusView {
  projectId: string
  stage: ConversionStage
  status: ConversionStatus
  /** The last decision the user made. */
  decision?: ConversionDecision
  verdict?: ConvertibilityVerdict
  stack?: ConversionStackRef
  /** What the conversion is rebuilding the project ONTO. Always the Viable stack today. */
  targetStack?: ConversionStackRef
  architecture?: ArchitectureCase
  /** One per stage that has been estimated, newest last. */
  estimates: ConversionEstimate[]
  storyEstimate?: StoryEstimateBand
  originState: OriginState
  /** How many questions the conversion answered for itself. Each one is readable in the docs. */
  assumptions: number
  runId?: string
  /** Set exactly when `status` is `Waiting`: the question the run stopped on. */
  pendingInquiry?: InquiryPayload
  waitingFor?: ConnectWaitReason
  lastError?: string
  updatedAt: string
}
