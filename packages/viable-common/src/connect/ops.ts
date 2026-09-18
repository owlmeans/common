import type { SlotCommandPayload } from '../slot/index.js'
import type {
  ConnectInquiryKind, ConnectOpErrorKind, ConnectOpKind, ModelTaskMode, ModelTaskResultKind,
  ModelTaskRole, ModelTier
} from './consts.js'
import type { ConnectServices } from './types.js'

/**
 * One thing the platform asks a connector to do.
 *
 * Operations are addressed to a PROJECT, not to a session: a connector that restarts mid-run
 * re-attaches and is handed whatever is still pending, so an MCP server dying does not kill a
 * pipeline that is minutes into its work. `sessionId` records which session it was published to,
 * for tracing and for the redelivery counter — never for routing a result back.
 */
export interface ConnectOp {
  id: string
  projectId: string
  sessionId: string
  kind: ConnectOpKind
  payload: SlotCommandPayload | ModelTask | ConfigurePayload | InquiryPayload
  createdAt: string
  /** When the asker stops waiting. A connector past this may skip the work and say so. */
  deadlineAt: string
  /** How many times this op has been delivered. > 1 means a connector reconnected. */
  attempt: number
  deliveredAt?: string
}

/**
 * The answer to exactly one operation.
 *
 * `ok: false` with `kind: 'malformed'` is a RETRYABLE outcome — the platform asks again, with the
 * problem quoted back. `'unavailable'` says the connector cannot do this at all and the run should
 * fail rather than spin.
 */
export interface ConnectOpResult {
  opId: string
  sessionId: string
  ok: boolean
  value?: unknown
  error?: ConnectOpError
}

export interface ConnectOpError {
  type: string
  message: string
  kind?: ConnectOpErrorKind
}

/**
 * The configuration a local target needs, as file CONTENT rather than as keys.
 *
 * The platform composes it — it is the only side that knows the OIDC client, its secret and the
 * redirect URIs — and the connector writes it into the managed block of each named file, leaving
 * every line the user added alone. `probe` names the services the platform wants to know about
 * before it asks for a database migration or a boot check.
 */
export interface ConfigurePayload {
  files: ConfigureFile[]
  probe: Array<keyof ConnectServices>
}

export interface ConfigureFile {
  /** Target-root-relative, e.g. `.env` or `sources/web/.env`. */
  path: string
  /** The managed block's content. Written between the connector's own markers. */
  content: string
}

export interface ConfigureResult {
  written: string[]
  /**
   * Keys the target still needs and the user must supply — a local database URL, say.
   *
   * Read exactly like the publisher's configure acknowledgement: a key with an EMPTY value counts
   * as missing, because a push that ran before a secret existed leaves one behind.
   */
  missing: string[]
  services: ConnectServices
}

/**
 * One model call, handed to the parent agent.
 *
 * It carries everything a fresh subagent needs and nothing it does not: the persona as a system
 * prompt, the conversation so far, and the shape the answer must take. There is no platform
 * vocabulary in it — no pipeline, no step, no internal role semantics beyond a name and a tier —
 * because it is read by a model the platform does not own.
 */
export interface ModelTask {
  id: string
  projectId: string
  /** The job the call belongs to, so a parent can say what it is working on. */
  jobId?: string
  /** The platform role that asked. Informational; the tier is what decides the model. */
  role: string
  tier: ModelTier
  /** Which attempt this is. > 0 means a previous answer was refused; `feedback` says why. */
  attempt: number
  mode: ModelTaskMode
  system?: string
  messages: ModelTaskMessage[]
  /** `Tools` mode: what the subagent may call. JSON Schema per tool. */
  tools?: ModelTaskTool[]
  /** `Tools` mode: force one tool, or leave the choice open. */
  toolChoice?: ModelTaskToolChoice
  /** `Json` mode: the schema the single returned object must satisfy. */
  outputSchema?: Record<string, unknown>
  /** A soft cap, stated so a parent can size its own call. */
  maxOutputChars?: number
  /** Present on a retry: what was wrong with the previous answer. */
  feedback?: string
  expiresAt: string
}

export interface ModelTaskMessage {
  role: ModelTaskRole
  content: string
  /** Assistant messages that called tools. */
  toolCalls?: ModelTaskToolCall[]
  /** Tool messages answer one call. */
  toolCallId?: string
  /** Tool messages name the tool they answer. */
  name?: string
}

export interface ModelTaskTool {
  name: string
  description?: string
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>
}

export type ModelTaskToolChoice = 'auto' | 'none' | { name: string }

export interface ModelTaskToolCall {
  id?: string
  name: string
  args: Record<string, unknown>
}

/** What the parent's subagent produced. */
export interface ModelTaskResult {
  taskId: string
  kind: ModelTaskResultKind
  text?: string
  json?: unknown
  toolCalls?: ModelTaskToolCall[]
  /** Why the parent could not answer. Treated as a malformed answer and retried. */
  error?: string
  /** What the parent spent. Recorded for the trace; it costs the platform nothing. */
  usage?: ModelTaskUsage
  /** What the parent actually ran. Display only. */
  model?: string
}

export interface ModelTaskUsage {
  inputTokens?: number
  outputTokens?: number
}

/** One option a {@link ConnectInquiryKind.Choice} question offers. */
export interface ConnectInquiryOption {
  value: string
  label: string
  description?: string
}

/**
 * One question put to the person the connector is working for.
 *
 * It carries where it came from — the job, the run and the step — because an answer is recorded
 * against the run that asked and re-read when that run resumes. `expiresAt` is what makes an
 * unanswered question fail its step instead of parking a project lock forever.
 */
export interface InquiryPayload {
  id: string
  projectId: string
  jobId?: string
  runId?: string
  /** The pipeline step that asked, so a resumed run can match the answer to the place it belongs. */
  step?: string
  kind: ConnectInquiryKind
  question: string
  /** What the asker already knows, so the person is not asked to go and find it out. */
  context?: string
  options?: ConnectInquiryOption[]
  multiple?: boolean
  /** Whether a choice question also accepts text the options do not cover. */
  allowText?: boolean
  /** What the asker will assume if nobody answers. Recorded as an assumption when it is used. */
  default?: string | string[]
  expiresAt: string
}

/**
 * The answer to one question.
 *
 * `declined` is a real answer and not an absence: it says a person saw the question and chose not
 * to decide, which the asker records as an assumption rather than waiting out the timeout.
 */
export interface InquiryAnswerPayload {
  inquiryId: string
  value?: string | string[]
  text?: string
  declined?: boolean
}
