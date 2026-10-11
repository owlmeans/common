import type {
  ConnectExecutor, ConnectHarness, ConnectLlm, ConnectSessionStatus, ConnectTarget, ConnectTransport, ModelTier
} from '../consts.js'

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
