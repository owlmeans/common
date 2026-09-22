import type {
  ArchitectureCase, ConversionDecision, ConversionEstimate, ConversionStackRef, ConversionStage,
  ConversionStatus, ConvertibilityReason, ConvertibilityVerdict, OriginKind, OriginShape,
  OriginState, StoryEstimateBand
} from '../convert/index.js'
import type {
  ConnectExecutor, ConnectHarness, ConnectLlm, ConnectSessionStatus, ConnectTarget,
  ConnectTransport, ConnectWaitReason, ModelTier
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

export interface ConnectPullQuery {
  /** Seconds to wait before answering; clamped to the pull ceiling. */
  wait?: number
}

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
  run?: ConnectRunStatus
  waitingFor?: ConnectWaitReason
  pendingInquiry?: InquiryPayload
  session?: ConnectSessionView
  /** Set for a local target: the connector should not offer cloud-only operations. */
  local: boolean
  updatedAt: string
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
   * work: a conversion reads somebody else's whole repository, which is the one case where handing
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

/**
 * A project's branding as a connector reads it — what the generated application says about who
 * made it, and the Google tag it loads.
 *
 * Every field is a string, `''` when unset, in the platform's own branding vocabulary. The
 * platform credit is absent on purpose: hiding it is a paid capability behind its own gated route,
 * and neither reading nor saving this record may reach it.
 */
export interface ConnectProjectBranding {
  /** The copyright line in the application's footer. Never empty once saved. */
  copyright: string
  /** The organization's display name. Never empty once saved. */
  organizationName: string
  /** `''`, an `https://` URL, or a same-origin path such as `/terms` (the generated page). */
  termsUrl: string
  /** `''`, an `https://` URL, or a same-origin path such as `/privacy` (the generated page). */
  privacyUrl: string
  /** `''`, or a Google tag id: `GTM-…`, `G-…`, `GT-…`, `AW-…`, `DC-…`. */
  googleTag: string
}

/**
 * A PATCH of a project's branding: every field optional, and an absent field keeps its current
 * value. The platform merges it over what is stored, validates the result as a whole with the
 * rules the web form uses, and answers the merged record.
 */
export interface ConnectProjectBrandingSave extends Partial<ConnectProjectBranding> {}

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
  waitingFor?: ConnectWaitReason
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
  waitingFor?: ConnectWaitReason
  pendingInquiry?: InquiryPayload
  attempts: number
  startedAt: string
  heartbeatAt: string
  updatedAt: string
}
