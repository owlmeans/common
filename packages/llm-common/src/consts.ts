
/**
 * Inference provider family a {@link ModelConfigPatch}/config targets. Each value is
 * the `type` of an `LlmPlugin` registered in `@owlmeans/llm`; a downstream package
 * can register additional plugins under its own type string.
 */
export enum ModelProvider {
  /** Proprietary OpenAI endpoint (Responses API for the `gpt-5*` / `codex-*` families). */
  OpenAI = 'openai',
  /** Anthropic messages API. */
  Anthropic = 'anthropic',
  /** Any OpenAI-compatible endpoint — OpenRouter, HuggingFace router, Together, vLLM, … */
  Compatible = 'compatible',
}

/**
 * Refinement level of an execution. An execution is refined downward only:
 * root → task → helper, each step producing a new frozen object.
 */
export enum ExecutionLevel {
  Project = 'project',
  Task = 'task',
  Helper = 'helper',
}

/**
 * Orthogonal capability tier carried by a {@link ModelPolicy} — the single,
 * inheritable "how hard should this run" axis. Maps to a JSON-safe model config
 * patch through the effort table in `@owlmeans/llm`.
 */
export enum ExecutionEffort {
  Economy = 'economy',
  Standard = 'standard',
  High = 'high',
  Max = 'max',
}

/**
 * How a model is asked to produce a schema-conforming object.
 *
 * - `Native` — the provider's own JSON-schema mode
 *   (`response_format: { type: 'json_schema' }`).
 * - `Tool` — the forced-`tool_choice` tool-calling hack: a synthetic function whose
 *   parameters ARE the schema, with the tool choice pinned to it.
 *
 * The decision is per provider plugin, overridable per model config.
 */
export enum StructuredMode {
  Native = 'native',
  Tool = 'tool',
}

/** Content shape of a single logged spectator message. */
export enum SpectatorContentType {
  Text = 'text',
  Json = 'json',
  ToolCall = 'tool_call',
}

/** Default spectator entry kind for consumers that do not classify their calls. */
export const SPECTATOR_GENERAL = 'general'

/**
 * Ordered sections of a composed system prompt.
 *
 * The ordering is not cosmetic — it IS the prompt-cache design. Every provider caches
 * a prompt by exact PREFIX match, so the sections are laid out most-stable first and a
 * cache breakpoint is placed at each stability boundary:
 *
 * - `Role`     — the base system prompt defining who the model is. Stable per role.
 * - `Skills`   — the statically declared capabilities, rendered in a deterministic
 *                order. Stable per helper. A breakpoint closes `Role` + `Skills`.
 * - `Packages` — capabilities resolved from whatever the request happens to mention.
 *                Varies per request, so it gets its OWN breakpoint and can never
 *                invalidate the two blocks above it.
 * - `Context`  — volatile, caller-supplied system text. Never cached.
 */
export enum PromptBlock {
  Role = 'role',
  Skills = 'skills',
  Packages = 'packages',
  Context = 'context',
}

/**
 * Emission order of {@link PromptBlock}. Declared explicitly rather than derived from
 * the enum: the composed prompt must be byte-identical across processes and runtimes,
 * and enum iteration order is not part of any contract worth betting a cache on.
 */
export const PROMPT_BLOCK_ORDER: readonly PromptBlock[] = [
  PromptBlock.Role,
  PromptBlock.Skills,
  PromptBlock.Packages,
  PromptBlock.Context,
] as const

/** Sort weight of a skill that declares none — see `SkillDefinition.order`. */
export const DEFAULT_SKILL_ORDER = 100

/**
 * Conventional {@link ModelRole} for the cheap side calls the layer makes on its own
 * behalf — a relevance pick, a classification, a one-line judgement — rather than for the
 * work a caller asked for. A deployment that names its cheap tier differently points
 * `ModelPolicy.utilityRole` at its own alias; nothing else has to change.
 */
export const UTILITY_ROLE = 'utility'
