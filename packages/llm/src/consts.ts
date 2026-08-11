import { ExecutionEffort } from '@owlmeans/llm-common'
import type { CacheTtl, ModelConfigPatch } from '@owlmeans/llm-common'

/** Context-service alias for the {@link LlmService} (model factory / registry). */
export const LLM_SERVICE = 'owlmeans-llm-service'

/** Context-service alias for the {@link ExecutionService}. */
export const EXECUTION_SERVICE = 'owlmeans-llm-execution-service'

/** Context-service alias for the {@link PromptService} (skill registry + composition). */
export const PROMPT_SERVICE = 'owlmeans-llm-prompt-service'

/** Default number of attempts a single model call makes before giving up. */
export const DEFAULT_MODEL_RETRIES = 8

/**
 * Idle (inactivity) deadline in ms for a streamed response: abort the stream when no
 * new token has arrived within this window. NOT a total cap — the timer is re-armed on
 * every chunk, so long but actively-streaming generations are never aborted. Guards
 * against a provider that accepts the request and then never streams anything (observed
 * with throughput-sorted OpenRouter routing), which would otherwise block forever —
 * `maxRetries` never helps there because the request never errors, it just hangs.
 * Overridable per model via `ModelConfig.streamTimeout`, or for every model at once via
 * `LlmServiceOptions.streamTimeout` where the application composes its context.
 *
 * Three minutes, not longer: the timer resets on every token, so a legitimately long
 * generation is never at risk — this only bounds SILENCE. The cost of a high value is
 * paid entirely by hung calls, and a hang that takes five minutes to notice is a hang
 * that can stall an agent run for half an hour once retries multiply it.
 */
export const MODEL_STREAM_TIMEOUT_MS = 3 * 60 * 1000

/**
 * Number of failed attempts after which the retry escalator switches from a role's
 * cheap primary model to its configured `fallback` (stronger) model. With
 * {@link DEFAULT_MODEL_RETRIES} = 8 the primary runs attempts 0..2 and the fallback
 * runs attempts 3..7.
 */
export const FALLBACK_AFTER_ATTEMPTS = 3

/**
 * Output-token ceiling used by the retry escalator when a model config declares no
 * `maxTokensCap`. Deliberately high (192K) — it exceeds many real per-request output
 * limits, which is why a precise cap belongs in the preset: without it a retry can
 * issue a 400 "max_tokens exceeds the model's per-request limit".
 */
export const DEFAULT_MAX_OUTPUT_CAP = 3 * 64000

/** Provider hard limit on prompt-cache breakpoints per REQUEST (Anthropic). */
export const MAX_CACHE_BREAKPOINTS = 4

/**
 * Share of {@link MAX_CACHE_BREAKPOINTS} the composed system prompt may spend.
 *
 * Two is all it can use: the only STABLE boundaries are the end of role+skills and the end
 * of the packages block. The trailing context block is volatile and deliberately never
 * marked, so the remaining two breakpoints always stay available to the message prefix.
 */
export const MAX_SYSTEM_BREAKPOINTS = 2

/** Cache lifetime used when neither the call nor the service asks for another. */
export const DEFAULT_CACHE_TTL: CacheTtl = '5m'

/**
 * Smallest prefix worth marking as cacheable, in tokens. Providers silently refuse to
 * create an entry below their own threshold (1024 tokens on most Claude models, 512 on
 * the newest, 4096 on a few older ones — it is NOT monotonic across generations), so a
 * marker on a short prefix costs nothing but wastes a breakpoint and produces a
 * "caching enabled" log for an entry that was never written. Override per model with
 * `ModelConfig.cacheMinTokens`.
 */
export const MIN_CACHEABLE_TOKENS = 1024

/**
 * Characters per token used to size a prefix against {@link MIN_CACHEABLE_TOKENS}. A rough
 * average for English prose and TypeScript; only ever used to decide whether marking is
 * worth a breakpoint, never for billing or budgeting.
 */
export const CHARS_PER_TOKEN = 4

/**
 * Appended to the prompt of `invoke`/`request` when no message already mentions JSON.
 * Some providers refuse or ignore JSON modes unless the word appears in the prompt;
 * the length guidance keeps a verbose model from padding the object past the output
 * limit and truncating it.
 */
export const JSON_INSTRUCTION = 'Respond with a single complete and valid JSON object only. '
  + 'Do not wrap it in markdown fences, and do not add any commentary, reasoning, or explanation outside the JSON. '
  + 'Keep string values focused — do not pad them with restated requirements or numbered summaries, '
  + 'so the whole object stays within the output limit and is never truncated.'

/**
 * Qwen3-family soft switch that suppresses hidden reasoning. Injected when
 * `ModelConfig.disableThinking` is set; without it those models routinely spend the
 * whole output budget on thinking and return empty content with `finish_reason="length"`.
 */
export const NO_THINK_DIRECTIVE = '/no_think'

/** Tool name used for structured output when a schema carries no usable title/name. */
export const DEFAULT_TOOL_NAME = 'extract'

/** Default effort tier when a policy does not specify one. */
export const DEFAULT_EFFORT = ExecutionEffort.Standard

/**
 * Effort tier → JSON-safe model config bump merged into `LlmService.getModel` overrides.
 * Pure data: an explicit `modelOverride` always wins over this table, and a `roleOverride`
 * is applied before it.
 */
export const EFFORT_TABLE: Record<ExecutionEffort, ModelConfigPatch> = {
  [ExecutionEffort.Economy]: { maxTokensCap: 16000 },
  [ExecutionEffort.Standard]: {},
  [ExecutionEffort.High]: { maxTokens: 16000, maxTokensCap: 32000 },
  [ExecutionEffort.Max]: { maxTokens: 32000, maxTokensCap: 64000 },
}

/**
 * Execution fields that are collaborators, not state: never copied into a snapshot.
 * A consumer adds its own (e.g. a file-access helper) through
 * `ExecutionServiceOptions.collaboratorKeys`.
 *
 * `state` is in the list because a `TaskExecution` carries its own composed state —
 * without excluding it every `derive`/`escalate`/`withPurpose` would nest another copy.
 */
export const COLLABORATOR_KEYS: string[] = [
  'state', 'models', 'model', 'temperatureFactory', 'outputErrors', 'files', 'prompts',
]
