import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { MessageFieldWithRole } from '@langchain/core/messages'
import type { InitializedService } from '@owlmeans/context'
import type {
  CacheTtl, CacheTtlPolicy, CumulativeResults, FileProviderRef, LlmPurpose, PromptBlock, PromptPolicy,
  SkillDefinition,
} from '@owlmeans/llm-common'
import type { LlmPlugin, LlmSystemBlock } from '../plugins/types.js'

/**
 * Everything that shapes one composed system prompt. The serializable part
 * ({@link PromptPolicy}) travels on the execution state; the rest is per-call.
 */
export interface PromptInput extends PromptPolicy {
  /** Skills supplied verbatim, without registering them first. */
  inline?: SkillDefinition[]
  /**
   * Raw text for the `Context` block of the project message — a caller's own system message,
   * carried through unchanged, or facts a plugin contributes about the project.
   */
  context?: string[]
  /**
   * Skill aliases requested for THIS call only. Rendered into the `Tail`, after the call's own
   * payload: a set that changes per call must not sit inside a region other calls cache.
   */
  callSkills?: string[]
}

export interface PromptComposeParams {
  /** The ORIGINAL (unrefined) model the composed prompt will be sent to. */
  model: BaseChatModel
  /** Provider plugin governing the call. It marks the composed regions later, never during composition. */
  provider?: LlmPlugin
  purpose?: LlmPurpose
  action?: string
  /** File access a plugin may use to resolve knowledge from disk. */
  files?: FileProviderRef
  /**
   * A cheap model a plugin may spend ONE call on while composing — picking which of a
   * hundred candidate skills a request is actually about, classifying an ask. Resolved
   * lazily and allowed to yield `undefined`: no cheap tier is configured on most
   * deployments, and a plugin that cannot get one must degrade rather than fail.
   *
   * Whatever it returns must not change what lands in `Role` or `Skills` — a model's answer
   * is not reproducible byte-for-byte, so it belongs in `Packages`, `Context` or the `Tail`.
   */
  utility?: () => BaseChatModel | undefined
  /**
   * What the earlier steps of the pipeline this call runs in produced — normally the execution's
   * own `results`. Rendered into `PromptBlock.Results` by `resultsPlugin`; absent, that block is
   * not emitted and the composed bytes are exactly what they would be without it.
   */
  results?: CumulativeResults
}

/** What a prompt plugin sees and may contribute to. */
export interface PromptContext extends PromptComposeParams {
  input: PromptInput
  /** The call's messages. Read them for detection; do NOT mutate. */
  messages: readonly MessageFieldWithRole[]
  /** Append a rendered chunk to a block. Empty text is ignored. */
  add: (block: PromptBlock, text: string) => void
  /** Resolve skill aliases through the registry, following `requires`. */
  resolve: (aliases: readonly string[]) => SkillDefinition[]
  /**
   * Take exclusive ownership of `key` for THIS composition: the first caller gets `true`,
   * every later one `false`. Two plugins that can each render the same skill — a static
   * catalogue and a detector — would otherwise emit it twice, which costs tokens and
   * tells the model the same thing in two voices.
   *
   * The claim set is per `compose` call and consulted by nobody else, so a composition
   * where no plugin claims renders exactly the bytes it rendered before this seam existed.
   */
  claim: (key: string) => boolean
}

/**
 * A unit of system-prompt composition, registered on the {@link PromptService} at context
 * composition time. This is the seam that makes the LLM layer pluggable: the package
 * ships the role and skills plugins, an application adds its own.
 *
 * A plugin MUST be deterministic — same input, same bytes. Anything it contributes to a
 * cached block and cannot reproduce exactly invalidates the prefix for every call that
 * shares it.
 */
export interface LlmPromptPlugin {
  alias: string
  /** Lower runs first. The built-ins occupy 0 (role), 10 (skills), 80 (results) and 90 (context and tail). */
  order?: number
  /** Contribute static content, before anything has looked at the messages. */
  compose?: (ctx: PromptContext) => void | Promise<void>
  /** Contribute content derived from the messages (detection, lookup, fetch). */
  inspect?: (ctx: PromptContext) => void | Promise<void>
}

/** A cache lifetime for every breakpoint, resolved and clamped so none rises along the prefix. */
export interface ResolvedCacheTtl extends Required<CacheTtlPolicy> {}

/** Whether, and for how long, the composed regions are cached. */
export interface PromptCache {
  /** `PromptPolicy.cacheSystem` resolved — `false` leaves the system and project message unmarked. */
  enabled: boolean
  ttl: ResolvedCacheTtl
}

/**
 * A composed prompt, as plain text per region — the provider plugin marks it later, once the
 * whole request is known. A region with nothing in it is `null`.
 */
export interface PromptResult {
  /**
   * The system message: role, skills and packages. When none of those was contributed, the
   * project facts (results, context) stay here instead, as a caller's own system text always did.
   */
  system: string | null
  /** The project message — the user turn after the system: the operator header, results, context. */
  project: string | null
  /** Appended to the final message, after the call's own payload: per-call skills, late packages, types. */
  tail: string | null
  /** Every rendered block in emission order, each with the region it went to. */
  blocks: LlmSystemBlock[]
  cache: PromptCache
}

export interface PromptServiceOptions {
  /** Skills registered up front; equivalent to calling `register` after construction. */
  skills?: SkillDefinition[]
  /** Plugins registered up front, in addition to the built-ins. */
  plugins?: LlmPromptPlugin[]
  /** Default for `PromptPolicy.cacheSystem`. Defaults to `true`. */
  cacheSystem?: boolean
  /** Default for `PromptPolicy.cacheTtl`, under it key by key. `'5m'` wherever neither names one. */
  cacheTtl?: CacheTtl | CacheTtlPolicy
}

/**
 * Registry of reusable skills plus the plugin chain that turns a role and a set of skill
 * aliases into a cache-friendly system prompt.
 */
export interface PromptService extends InitializedService {
  /** Register a composition plugin. Runs in `order` then registration order. */
  use: (plugin: LlmPromptPlugin) => void
  /** Register (or replace, by alias) reusable skills. */
  register: (...skills: SkillDefinition[]) => void
  has: (alias: string) => boolean
  /** Resolve aliases to definitions, pulling in `requires` transitively. Unknown aliases are skipped. */
  resolve: (aliases: readonly string[]) => SkillDefinition[]
  /** Every registered skill, in deterministic order. */
  skills: () => SkillDefinition[]
  compose: (
    input: PromptInput,
    messages: readonly MessageFieldWithRole[],
    params: PromptComposeParams,
  ) => Promise<PromptResult>
}

export interface WithPromptService {
  prompts: () => PromptService
}

/** The part of {@link PromptService} this package implements — see {@link promptServiceApi}. */
export interface PromptServiceApi extends Pick<PromptService, 'use' | 'register' | 'has' | 'resolve' | 'skills' | 'compose'> {}
