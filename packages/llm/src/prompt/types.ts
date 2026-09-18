import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { MessageFieldWithRole } from '@langchain/core/messages'
import type { InitializedService } from '@owlmeans/context'
import type {
  CacheTtl, FileProviderRef, LlmPurpose, PromptBlock, PromptPolicy, SkillDefinition,
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
   * Raw text for the volatile `Context` block — a caller's own system message, carried
   * through unchanged. Never part of the cached prefix.
   */
  context?: string[]
  /**
   * Skill aliases requested for THIS call only. Rendered into `Context`, not `Skills`:
   * a set that changes per call must not sit inside the region other calls cache.
   */
  callSkills?: string[]
}

export interface PromptComposeParams {
  /** The ORIGINAL (unrefined) model the composed prompt will be sent to. */
  model: BaseChatModel
  /** Provider plugin governing the call — supplies the cache-marker strategy. */
  provider?: LlmPlugin
  purpose?: LlmPurpose
  action?: string
  /** Total breakpoint budget for the request. */
  cacheMax?: number
  /** File access a plugin may use to resolve knowledge from disk. */
  files?: FileProviderRef
  /**
   * A cheap model a plugin may spend ONE call on while composing — picking which of a
   * hundred candidate skills a request is actually about, classifying an ask. Resolved
   * lazily and allowed to yield `undefined`: no cheap tier is configured on most
   * deployments, and a plugin that cannot get one must degrade rather than fail.
   *
   * Whatever it returns must not change what lands in a CACHED block — a model's answer
   * is not reproducible byte-for-byte, so it belongs in `Packages` or `Context`.
   */
  utility?: () => BaseChatModel | undefined
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
  /** Lower runs first. The built-ins occupy 0 (role), 10 (skills) and 90 (context). */
  order?: number
  /** Contribute static content, before anything has looked at the messages. */
  compose?: (ctx: PromptContext) => void | Promise<void>
  /** Contribute content derived from the messages (detection, lookup, fetch). */
  inspect?: (ctx: PromptContext) => void | Promise<void>
}

export interface PromptResult {
  /** The composed system message, or `null` when nothing was contributed. */
  system: MessageFieldWithRole | null
  /** Breakpoints the system prompt consumed; subtract from the message budget. */
  breakpoints: number
  /** The rendered blocks in emission order — exposed for tests and diagnostics. */
  blocks: LlmSystemBlock[]
}

export interface PromptServiceOptions {
  /** Skills registered up front; equivalent to calling `register` after construction. */
  skills?: SkillDefinition[]
  /** Plugins registered up front, in addition to the built-ins. */
  plugins?: LlmPromptPlugin[]
  /** Default for `PromptPolicy.cacheSystem`. Defaults to `true`. */
  cacheSystem?: boolean
  /** Default for `PromptPolicy.cacheTtl`. */
  cacheTtl?: CacheTtl
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
