import type {
  ConnectExecutor, ConnectHarness, ConnectJobBlock, ConnectJobKind, ConnectJobStatus, ConnectLlm,
  ConnectSessionStatus, ConnectTarget, ConnectTransport, ModelTier
} from './consts.js'

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
  /** The default mode for a new session, resolved from the caller's settings. */
  defaults: { target: ConnectTarget, llm: ConnectLlm }
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
}
