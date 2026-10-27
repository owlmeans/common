import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseCallbackHandler, CallbackHandlerMethods } from '@langchain/core/callbacks/base'
import type { MessageFieldWithRole } from '@langchain/core/messages'
import type {
  CacheTtl, CacheTtlPolicy, ModelEffort, PromptBlock, PromptRegion, StructuredMode,
} from '@owlmeans/llm-common'
import type { ModelConfig } from '../types.js'
import type { CacheBoundary, ThinkingOff } from './consts.js'

/** The effort levels one model accepts, least work first, and the one it uses when unset. */
export interface EffortSupport {
  levels: ModelEffort[]
  default: ModelEffort
}

export interface LlmBuildParams {
  /** Alias the config was registered under — used only for error reporting. */
  alias: string
  /**
   * Fully resolved config with the secret already stripped. Whatever the plugin puts
   * on the client as `metadata.config` is what `readConfig` later reads back, so the
   * plugin should apply its model default to this object before building.
   */
  config: ModelConfig
  secret: string
  callbacks: (BaseCallbackHandler | CallbackHandlerMethods)[]
}

export interface LlmRefineParams {
  /** The model to rebuild — the primary, or the fallback once escalation kicked in. */
  base: BaseChatModel
  /** 0-based retry attempt; the output budget doubles with it. */
  attempt: number
  /**
   * 0-based attempt within the active rung (the primary or one fallback); effort climbs
   * with it, so every rung starts from its own declared level. Omitted, it is `attempt`.
   */
  rungAttempt?: number
  /** Call-site temperature override (`invoke`). */
  temperature?: number | undefined
  /** Hard ceiling the doubled output budget is clamped to. */
  maxOutputCap: number
}

/** One rendered section of the composed prompt, in emission order. */
export interface LlmSystemBlock {
  block: PromptBlock
  text: string
  /** Where the block travels — set by the prompt service on every block it composes. */
  region?: PromptRegion
}

/**
 * One place in a prepared request where a cache breakpoint MAY go — every stability boundary of
 * the prompt layout, whether or not it ends up marked. A plugin places the ones whose prefix
 * reaches its model's minimum, earliest first, until the budget is spent.
 */
export interface PromptBoundary {
  kind: CacheBoundary
  /** Index of the message the boundary closes. */
  message: number
  /** For a boundary inside the system message: the index (in `PromptPlan.system`) of its last block. */
  segment?: number
  ttl: CacheTtl
  /** Characters of the prompt up to and including this boundary. */
  prefixChars: number
}

/**
 * A prepared request, before any provider dialect: plain-string system and project messages, the
 * caller's conversation and the final message with its tail, plus where each breakpoint could go.
 */
export interface PromptPlan {
  /** The ORIGINAL (unrefined) model of the rung being prepared. */
  model: BaseChatModel
  /** That rung's config. */
  config: Partial<ModelConfig>
  messages: MessageFieldWithRole[]
  /** The composed blocks the system message (`messages[0]`) was joined from; empty when none was composed. */
  system: LlmSystemBlock[]
  /** Candidate breakpoints in prefix order — TTLs never rise along it. */
  boundaries: PromptBoundary[]
  /** How many breakpoints this request may carry. */
  budget: number
}

/** A plugin's rendering of a {@link PromptPlan}, or of a loop round. */
export interface PromptPatch {
  /** The messages to send — new objects wherever a marker went; the plan's own are never edited. */
  messages: MessageFieldWithRole[]
  /** Call options the dialect needs on the request (an explicit cache mode, an automatic marker). */
  options?: Record<string, unknown>
  /** Breakpoints placed. */
  placed: number
}

/** What a tool loop knows about the opening of its conversation. */
export interface LlmLoopCacheHints {
  /** The composed blocks of the system message, to split it at its stable boundaries. */
  system?: LlmSystemBlock[]
  /** Index of the project message, when the loop sends one. */
  project?: number
  /** The composed cache lifetimes; `'5m'` wherever unset. */
  ttl?: CacheTtlPolicy
}

/**
 * Everything that differs between inference providers, in one replaceable unit.
 *
 * Registration order matters for instance-based lookup (`resolvePlugin` with no
 * `provider` in the config): the FIRST plugin whose `owns` matches wins, so the
 * conservative member of a family must be registered before the permissive one.
 * See `plugins/index.ts`.
 */
export interface LlmPlugin {
  /** Provider identifier — a `ModelProvider` value, or a custom string. */
  type: string

  /**
   * Instance behaviour group. Two plugins that construct the same client class share a
   * family (e.g. `openai` and `compatible` both produce `ChatOpenAI`). The retry
   * escalator refuses to switch to a fallback from a different family, because the
   * structured-output call shape would change mid-call.
   */
  family: string

  /** Construct the chat client from a resolved config. */
  build: (params: LlmBuildParams) => BaseChatModel

  /** Does this model instance belong to this plugin's client family? */
  owns: (model: BaseChatModel) => boolean

  /**
   * Rebuild the model for retry attempt N: raise the output budget toward
   * `maxOutputCap` and apply any provider-specific escalation (e.g. shrinking a
   * reasoning budget so the extra tokens become visible output).
   */
  refine: (params: LlmRefineParams) => BaseChatModel

  /**
   * Does this plugin turn the model's reasoning off NATIVELY when the config asks for it
   * (`ModelConfig.disableThinking`)? When it does, the service must not also inject the
   * `/no_think` prompt directive — that is a soft switch for models with no request-level
   * control, and on a provider that has one it is nothing but text in the prompt.
   */
  suppressesThinking?: (config: Pick<ModelConfig, 'model' | 'disableThinking'>) => boolean

  /**
   * Which `ModelConfig.effort` levels this model accepts, given how the config treats
   * thinking — or `undefined` when it accepts none, in which case no effort is sent.
   */
  effort?: (config: Pick<ModelConfig, 'model' | 'disableThinking'>) => EffortSupport | undefined

  /** How this provider should be asked for schema-conforming output. */
  structuredMode: (config: ModelConfig) => StructuredMode

  /**
   * Provider-specific `tool_choice` for the structured-output tool `toolName`: the shape that
   * pins it, or — for a model that refuses a pinned tool ({@link pinsTool} `false`) — the
   * provider's automatic choice. `config` is the rung's own, so a fallback is asked in its shape.
   */
  toolChoice: (toolName: string, config?: Partial<ModelConfig>) => unknown

  /**
   * Whether {@link toolChoice} pins the tool for this model. Omitted: it always does. When it
   * does not, the request carries an instruction naming the tool (the only way left to ask for
   * the call), and a reply with no tool call is a failed attempt the retry loop repeats.
   */
  pinsTool?: (config: Partial<ModelConfig>) => boolean

  /**
   * Whether the structured-output tool is sent `strict` (grammar-constrained arguments) for this
   * model and schema. Omitted: never.
   */
  strictTool?: (config: Partial<ModelConfig>, schema: unknown) => boolean

  /**
   * What stops this provider from SHOWING the model a structured-output schema as written — one
   * line per defect, each naming its JSON pointer. A non-empty answer fails the call before the
   * rung's first request with a fatal `LlmMissconfiguredError`: a model cannot answer what it is
   * never shown, and every retry would fail validation the same way. Omitted: nothing is hidden.
   */
  schemaDefects?: (config: Partial<ModelConfig>, schema: unknown) => string[]

  /** Provider-specific `response_format` for {@link StructuredMode.Native}. */
  responseFormat?: (toolName: string, schema: unknown) => Record<string, unknown>

  /**
   * Render a prepared request in this provider's cache dialect: place breakpoints on the plan's
   * boundaries (skipping those below the model's minimum, within the budget) and name whatever
   * call options the dialect needs. Never edits the plan's message objects. Omit for a provider
   * whose prompt cache needs nothing beyond the order of the bytes.
   */
  patchPrompt?: (plan: PromptPlan) => PromptPatch

  /**
   * Cache one round of a tool loop: strip any marker the messages carry (on copies), mark the
   * stable opening — the system message at its boundaries and the project message — and let the
   * growing conversation be read back round after round. Called with the UNBOUND model.
   */
  loopCache?: (
    messages: MessageFieldWithRole[], model: BaseChatModel, hints?: LlmLoopCacheHints,
  ) => PromptPatch

  /**
   * The cache dialect a config is prepared in (`CacheDialect`). Two rungs of one family in
   * different dialects are prepared separately. Omitted: the family alone decides.
   */
  cacheDialect?: (config: Partial<ModelConfig>) => string

  /**
   * Classify a thrown error as fatal for the retry loop. Return the error to throw
   * immediately, or `null` to let it be retried.
   */
  isFatal?: (e: unknown) => Error | null
}

/** The instance-level behaviours every plugin that constructs a `ChatOpenAI` shares. */
export interface OpenAiFamily {
  family: string
  owns: (model: BaseChatModel) => boolean
  /**
   * langchain converts the OpenAI-shaped tool DEFINITION for either provider, but the
   * `tool_choice` shape is NOT converted — this is the OpenAI spelling.
   */
  toolChoice: (toolName: string) => unknown
  /**
   * `strict: false` keeps schemas that do not satisfy OpenAI strict-mode rules
   * acceptable; the model's own ajv validation still enforces conformance afterwards.
   */
  responseFormat: (toolName: string, schema: unknown) => Record<string, unknown>
  /** A 400 means the request itself is malformed — retrying re-sends the same shape. */
  isFatal: (e: unknown) => Error | null
  refine: (params: LlmRefineParams) => BaseChatModel
}

/** What one Anthropic model family accepts, where the families differ in ways that are a 400. */
export interface AnthropicModelSupport extends EffortSupport {
  /** Model-id prefix; the table below is first match wins, so a longer id comes first. */
  prefix: string
  /**
   * The `thinking.type` that turns up-front thinking off. `null`: the model always thinks and
   * refuses every off switch, so the request sends no `thinking` and effort is the only control.
   * Omitted: `disabled`.
   */
  thinkingOff?: ThinkingOff | null
  /** The highest effort the model accepts together with its off switch. */
  thinkingOffCeiling?: ModelEffort
  /**
   * An absent `thinking` field means adaptive thinking here (the 5 family). On Opus 4.8/4.7 it
   * means none, so they are not marked.
   */
  thinksByDefault?: boolean
  /** `tool_choice` `any` / `tool` is a 400: only `auto` and `none` are accepted. */
  rejectsForcedTool?: boolean
  /** The model's own minimum cacheable prefix, in tokens ({@link MIN_CACHEABLE_TOKENS} when omitted). */
  cacheMinTokens?: number
}
