import type { ExecutionEffort, ExecutionLevel, PromptBlock } from './consts.js'

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
 * Lifetime of a provider-side prompt cache entry. `'1h'` costs roughly twice as much to
 * write as `'5m'`, so it only pays off from the third read onward — use it for a system
 * prefix that survives a long run, not for a one-shot call.
 */
export type CacheTtl = '5m' | '1h'

/**
 * One named, reusable chunk of system-prompt knowledge — a capability the model is told
 * it has. Registered once (by the package that owns the knowledge or by the final app)
 * and referenced by `alias` from any execution level.
 *
 * `body` must be a PURE CONSTANT: no timestamps, no absolute paths, no interpolated
 * request data. Every skill lands in the cached region of the system prompt, and one
 * varying byte invalidates the whole prefix for every call that shares it.
 */
export interface SkillDefinition {
  /** Stable slug — how executions reference the skill. */
  alias: string
  /** Rendered as the skill's heading; falls back to `alias`. */
  title?: string
  /** Not sent to the model — documentation for whoever wires the registry. */
  description?: string
  /** The prompt text itself. */
  body: string
  /** Sort weight; ties broken by `alias`. Defaults to `DEFAULT_SKILL_ORDER`. */
  order?: number
  /** Which block to render into. Defaults to `PromptBlock.Skills`. */
  block?: PromptBlock
  /** Aliases pulled in transitively when this skill is enabled. */
  requires?: string[]
}

/**
 * The "flexible execution parameters" that shape a system prompt. Carried on
 * {@link ExecutionState}, so it is JSON-safe, survives a checkpoint/restore round trip,
 * and accumulates down the execution chain: a task adds skills on top of the project,
 * a helper on top of the task. `role` is overridden by the deepest level that sets it;
 * `skills` are unioned.
 */
export interface PromptPolicy {
  /** Base system prompt — becomes the first block. */
  role?: string
  /** Skill aliases enabled at this level. */
  skills?: string[]
  /** Mark the composed system prompt cacheable. Defaults to `true`. */
  cacheSystem?: boolean
  /** Cache lifetime for the system prefix. Defaults to `'5m'`. */
  cacheTtl?: CacheTtl
}

/**
 * Prompt-cache accounting for a single call, normalized across providers. The only
 * reliable way to tell whether caching actually works: if `read` stays 0 across repeated
 * calls with the same prefix, something is silently invalidating it.
 */
export interface CacheUsage {
  /** Tokens served from cache (~0.1x price). */
  read: number
  /** Tokens written to cache (~1.25x price at 5m TTL, ~2x at 1h). */
  creation: number
  /** Tokens processed at full price. */
  input: number
  output: number
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
  /** Role + skills for this level; merged downward by `ExecutionService`. */
  prompt?: PromptPolicy
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
