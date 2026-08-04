
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
