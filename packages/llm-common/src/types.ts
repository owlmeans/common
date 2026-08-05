import type { ExecutionEffort, ExecutionLevel } from './consts.js'

/**
 * Free-form observability metadata attached to every model call — forwarded to the
 * inference provider as run metadata and recorded on every spectator entry. Kept
 * intentionally small; a consumer extends it with its own domain fields.
 */
export interface LlmPurpose {
  /** Coarse classification of the caller (e.g. `'coder'`, `'analyst'`). */
  type?: string
  /** Narrow, per-call refinement — set by `ExecutionService.forHelper`. */
  dedication?: string
}

/**
 * Serializable role name used to select a model. Deliberately an open `string`:
 * a consumer declares its own role enum (whose values are strings) and it stays
 * assignable here.
 */
export type ModelRole = string

/**
 * JSON-safe subset of the runtime `ModelConfig` (`@owlmeans/llm`). Mirrors only the
 * serializable, tier-relevant fields — never `provider` / `secret` / `headers` /
 * `fallback`. Lives here so an execution state can be persisted and replayed.
 */
export interface ModelConfigPatch {
  preset?: string
  model?: string
  temperature?: number
  maxTokens?: number
  maxTokensCap?: number
  topP?: number
  disableThinking?: boolean
}

/** A JSON-safe model override: a config alias, or a partial config patch. */
export type ModelConfigOverride = string | ModelConfigPatch

/**
 * A single, inheritable model-selection policy carried by every execution.
 * Resolution precedence (see `ExecutionService.model`):
 * roleOverride → modelOverride → effort tier → `LlmService.getModel`.
 */
export interface ModelPolicy {
  /** Orthogonal capability tier. */
  effort: ExecutionEffort
  /** "Use role X wherever role Y is requested" — remap an entire sub-flow's roles. */
  roleOverrides?: Partial<Record<ModelRole, ModelRole>>
  /** "Pin a role to a specific model/config" — alias or partial config override. */
  modelOverrides?: Partial<Record<ModelRole, ModelConfigOverride>>
}

/**
 * Serializable execution state — no functions, no file access, no model instances.
 * The runtime `Execution` (`@owlmeans/llm`) = this state + attached collaborators.
 * A consumer extends this interface with its own domain fields; everything declared
 * on the extension is carried into the snapshot automatically.
 */
export interface ExecutionState {
  level: ExecutionLevel
  purpose: LlmPurpose
  policy: ModelPolicy
}

/** Resumable state of a task-level execution. */
export interface TaskExecutionState extends ExecutionState {
  /** Abstract workflow position for checkpoint/resume. */
  phase?: string
  completed?: string[]
  cursor?: string
  data?: Record<string, unknown>
}

/** Which model call produced a null/unusable result — carried by {@link NullCapture}. */
export type NullKind = 'ask' | 'talk' | 'invoke' | 'request'

/**
 * Full diagnostic capture of a model call that returned nothing usable. Emitted by the
 * model to the spectator's `captureNull` sink so a stalled/empty provider response can
 * be replayed and diagnosed after the fact (finish reason, token accounting, whether a
 * tool call was attempted, the exact request that produced it).
 */
export interface NullCapture {
  meta: {
    kind: NullKind
    action: string
    purpose?: LlmPurpose
    attempt: number
    id: string
    timestamp: number
    elapsedMs: number
  }
  model: {
    id?: string
    provider?: string
    baseUrl?: string
    maxTokens?: number
    reasoning?: unknown
    temperature?: number
    topP?: number
  }
  request: {
    messages: unknown[]
    schema?: { toolName: string; innerSchema: unknown }
    useCache: boolean
  }
  response: {
    content: unknown
    additional_kwargs?: unknown
    response_metadata?: unknown
    usage_metadata?: unknown
    tool_calls?: unknown
  } | null
  diagnostics: {
    finishReason?: string
    inputTokens?: number
    outputTokens?: number
    reasoningTokens?: number
    contentEmpty: boolean
    hadToolCall: boolean
  }
}
