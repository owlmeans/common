import type {
  ArchitectureCase, ConversionDecision, ConversionEstimate, ConversionStackRef, ConversionStage,
  ConversionStatus, ConvertibilityReason, ConvertibilityVerdict, OriginKind, OriginShape,
  OriginState, StoryEstimateBand
} from '../convert/index.js'
import type {
  ConnectExecutor, ConnectHarness, ConnectJobBlock, ConnectJobKind, ConnectJobStatus, ConnectLlm,
  ConnectSessionStatus, ConnectTarget, ConnectTransport, ModelTier
} from './consts.js'
import type { InquiryAnswerPayload, InquiryPayload } from './ops.js'

/**
 * What a parent agent can do, as it reports itself.
 *
 * `tiers` is what decides whether the local-LLM mode is usable at all: a parent that names no
 * model for a tier still gets tasks, clamped to the nearest tier it does offer.
 */
export interface ConnectCapabilities {
  harness: ConnectHarness
  /** Tier → the parent's own name for the model it will run that tier on. Display only. */
  tiers: Partial<Record<ModelTier, string>>
  /** Whether the parent can run a task in an isolated subagent rather than its own conversation. */
  subagents: boolean
  /** Whether the parent can ask for low reasoning effort explicitly. */
  effortControl: boolean
  /** Which operation kinds this connector will execute. */
  executors: ConnectExecutor[]
  /** What the local machine has, learned from the configure op. Absent until one has run. */
  services?: ConnectServices
}

/** What a local machine actually provides. Reported by the connector, never assumed. */
export interface ConnectServices {
  db: boolean
  valkey: boolean
}

export interface ConnectSession {
  id?: string
  profileId: string
  entityId: string
  projectId?: string
  /** The absolute directory the target lives in, for a local target. Identity for supersede. */
  projectDir?: string
  target: ConnectTarget
  llm: ConnectLlm
  harness: ConnectHarness
  clientVersion: string
  capabilities: ConnectCapabilities
  status: ConnectSessionStatus
  /** How the connector is receiving operations right now. */
  transport?: ConnectTransport
  openedAt: Date
  lastSeenAt: Date
  closedAt?: Date
  createdAt: Date
  updatedAt?: Date
}

/** What a connector asks for when it attaches. */
export interface ConnectSessionOpen {
  projectId?: string
  projectDir?: string
  target: ConnectTarget
  harness: ConnectHarness
  clientVersion: string
  capabilities: ConnectCapabilities
}

export interface ConnectSessionParams {
  sessionId: string
}

export interface ConnectSessionView {
  id: string
  target: ConnectTarget
  llm: ConnectLlm
  projectId?: string
  status: ConnectSessionStatus
  /** Operations waiting for this session right now. */
  pending: number
  expiresAt: string
}

/**
 * A derived view of "what the platform is doing for this project right now".
 *
 * Never stored. It is composed per request from the project lock, the slot record, the story
 * record, the latest pipeline run row and the operations queued for the project — the same facts
 * the manager UI reads, arranged for a caller that has one question ("may I stop waiting?") and
 * one follow-up ("what do I call next?").
 */
export interface ConnectJob {
  id: string
  kind: ConnectJobKind
  status: ConnectJobStatus
  projectId: string
  storyId?: string
  runId?: string
  /** The pipeline step in flight, when a run row says. */
  phase?: string
  progress?: ConnectJobProgress
  blockedOn?: ConnectJobBlock
  /**
   * The question a parked run is waiting on — present exactly when it is blocked on one.
   *
   * Carried on the job rather than left to a second lookup because a parent reads a job and
   * nothing else while it polls: a run that stopped for a person, described only as "blocked",
   * is a run whose parent waits out the timeout for a question it was never shown. It is also
   * the ONLY way back to a question whose operation timed out while nobody was attached — the
   * connector's own queue holds nothing at that point.
   */
  inquiry?: InquiryPayload
  /** One sentence a parent agent can show a human. */
  message?: string
  /** Present on `Failed`, and on `Done` where the run recorded a warning. */
  error?: string
  /** Kind-specific payload once `Done`. */
  result?: Record<string, unknown>
  startedAt?: string
  updatedAt: string
}

export interface ConnectJobProgress {
  step?: string
  completed: string[]
  pending: string[]
}

export interface ConnectJobParams {
  id: string
  jobId: string
}

export interface ConnectWaitQuery {
  /** Seconds to wait before answering; clamped to the pull ceiling. */
  wait?: number
}

/** Paging and filtering for the story list a connector reads. */
export interface ConnectStoryQuery {
  page?: number
  size?: number
  status?: string
  area?: string
  /** Free-text match against the story narrative and its code. */
  q?: string
}

export interface ConnectStoryList {
  items: ConnectStoryItem[]
  page: number
  size: number
  total: number
}

export interface ConnectStoryItem {
  id: string
  code?: string
  story: string
  area?: string
  status: string
  primary: boolean
  warning?: string
  createdAt: string
}

/** What a connector needs to know about a project in one call. */
export interface ConnectProjectStatus {
  project: {
    id: string
    name: string
    alias: string
    description?: string
    specification?: string
    vision?: string
  }
  slot?: {
    id: string
    kind: string
    status: string
    slug: string
    host?: string
    initialized?: boolean
    lastError?: string
    buildWarning?: string
    backendWarning?: string
  }
  production?: { id: string, status: string, host?: string }
  agent: { locked: boolean, task?: string, lockedAt?: string }
  run?: {
    runId: string
    pipeline: string
    status: string
    step?: string
    completed: string[]
    pending: string[]
    error?: string
  }
  session?: ConnectSessionView
  /** Set for a local target: the connector should not offer cloud-only operations. */
  local: boolean
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

/** The per-profile connector preference. */
export interface ConnectProfileSettings {
  llmMode: ConnectLlm
}

export interface ConnectProfileSettingsView extends ConnectProfileSettings {
  /** Whether the organization's plan allows the local-LLM mode at all. */
  canUseLocal: boolean
  /**
   * The profile's preference for who performs a CONVERSION's model calls.
   *
   * Its own setting rather than a reading of `llmMode`, because the two answer for different
   * work: a conversion reads somebody else's whole repository, which is the one job where handing
   * the inference to the parent agent is the cheap default rather than the experimental option.
   *
   * OPTIONAL for the same reason {@link ConnectCapabilitiesView.defaults} carries `converterLlm`
   * optionally: the two converter fields are answered by a platform build that does not exist yet,
   * and this package is consumed by the platform through a workspace link rather than a published
   * range — a required field here is a compile error in every handler that already returns this
   * view. Tightened to required once the platform's conversion handlers fill them.
   */
  converterLlmMode?: ConnectLlm
  /** Whether this caller may run a conversion's model calls on the parent agent. */
  canUseConverterLocal?: boolean
}

export interface ConnectLlmBody {
  llmMode: ConnectLlm
}

/** The per-project override, and what it resolves to. */
export interface ConnectProjectSettings {
  /** `null` means "inherit the profile setting". */
  llmMode: ConnectLlm | null
  effective: ConnectLlm
  canUseLocal: boolean
  /**
   * The project's converter override; `null` inherits the profile's.
   *
   * Optional on the same forward-compatibility grounds as
   * {@link ConnectProfileSettingsView.converterLlmMode} — absent from an answer written before the
   * platform's conversion handlers land, and never to be read as a value.
   */
  converterLlmMode?: ConnectLlm | null
  /** What the override, the profile and the platform's own floor actually resolve to. */
  converterEffective?: ConnectLlm
}

export interface ConnectProjectLlmBody {
  llmMode: ConnectLlm | null
}

/** What the platform tells a connector about itself. */
export interface ConnectCapabilitiesView {
  /** Tier → the platform role names that will be asked for at that tier. */
  tiers: Record<ModelTier, string[]>
  /** Whether this caller may open a local-LLM session. */
  localLlm: boolean
  /**
   * The default mode for a new session, resolved from the caller's settings.
   *
   * `converterLlm` is OPTIONAL: an older platform does not send it, and a client that treated its
   * absence as a value would pin every conversion to whatever its own default happened to be.
   */
  defaults: { target: ConnectTarget, llm: ConnectLlm, converterLlm?: ConnectLlm }
  limits: {
    pullWaitMs: number
    modelTaskTimeoutMs: number
    maxPending: number
  }
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
}

/** Confirm a drafted project, optionally editing what the analysis produced. */
export interface ConnectConfirmBody {
  name?: string
  description?: string
  specification?: string
  vision?: string
  target?: ConnectTarget
}

export interface ConnectModifyBody {
  prompt: string
}

export interface ConnectStoryBody {
  story: string
}

export interface ConnectPipelineParams {
  id: string
  runId: string
}

export interface ConnectPipelineResumeBody {
  from?: string
  force?: boolean
  /**
   * Answers to the questions a parked run is waiting on, keyed by inquiry id.
   *
   * A run stops at `Waiting` because a step asked something; resuming it without what it asked for
   * makes it ask again. The runner MERGES these into whatever the run already carries rather than
   * replacing them, so a resume that answers one of two outstanding questions keeps the other.
   */
  answers?: Record<string, InquiryAnswerPayload>
}

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
}

/** Decide what happens at a stage boundary. */
export interface ConnectConvertProceedBody {
  decision: ConversionDecision
  /** Free text the user added to the decision; recorded, never parsed. */
  note?: string
}

/** Answer one question a parked run is waiting on. */
export type ConnectInquiryAnswerBody = InquiryAnswerPayload

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
  lastError?: string
  updatedAt: string
}

/** The acknowledgement returned when a connector submits an operation result. */
export interface ConnectOpSubmission {
  ok: boolean
  /** The operation was already resolved; retrying a lost HTTP response is safe. */
  ignored?: boolean
}

/** The deliberate small projection returned by the connector project list. */
export interface ConnectProjectSummary {
  id: string
  name: string
  alias: string
}

/** A story item returned after creating, editing or fetching one story. */
export interface ConnectStoryMutation {
  id: string
  code?: string
  story: string
  area?: string
  status: string
  primary: boolean
  warning?: string
  createdAt: string
}

/** The success answer for deleting a story. */
export interface ConnectStoryDeletion {
  deleted: boolean
}

/** The persistent state of one pipeline run, read by a connector without platform internals. */
export interface ConnectPipelineState {
  runId: string
  pipeline: string
  version: number
  status: string
  step?: string
  completed: string[]
  pending: string[]
  warnings: string[]
  failedAt?: string
  error?: string
  note?: string
  attempts: number
  startedAt: string
  heartbeatAt: string
  updatedAt: string
}
