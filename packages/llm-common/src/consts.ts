
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
  /**
   * No endpoint at all: the call is handed to whoever holds the execution.
   *
   * A delegated model does not talk to a provider. It packages the call — the system prompt, the
   * conversation, the tools or the schema — and hands it to a transport the application seated,
   * which carries it to something outside this process entirely: a coding agent driving the
   * application through a connector, a human, a test. The answer comes back the same way and is
   * turned into a completion the rest of the stack cannot tell apart from a provider's.
   *
   * It exists so that "who performs this call" can be a property of the SESSION rather than of the
   * code: the same pipeline, the same prompts and the same retry rules, billed to somebody else's
   * model.
   */
  Delegated = 'delegated',
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
 * The PROVIDER's own effort knob — OpenAI `reasoning.effort`, Anthropic
 * `output_config.effort`. Not {@link ExecutionEffort}: that is this package's tier, which
 * sizes token budgets; this is a value sent on the wire. Which levels a model accepts is a
 * provider-plugin fact in `@owlmeans/llm`.
 */
export enum ModelEffort {
  None = 'none',
  Minimal = 'minimal',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  XHigh = 'xhigh',
  Max = 'max',
}

/** {@link ModelEffort} from least to most work — the order an escalation climbs. */
export const MODEL_EFFORT_ORDER: readonly ModelEffort[] = [
  ModelEffort.None, ModelEffort.Minimal, ModelEffort.Low, ModelEffort.Medium,
  ModelEffort.High, ModelEffort.XHigh, ModelEffort.Max,
]

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
 * Ordered sections of a composed prompt.
 *
 * The ordering is not cosmetic — it IS the prompt-cache design. Every provider caches
 * a prompt by exact PREFIX match, so the sections are laid out most-stable first and a
 * cache breakpoint is placed at each stability boundary:
 *
 * - `Role`     — the base system prompt defining who the model is. Stable per role.
 * - `Skills`   — the statically declared capabilities, rendered in a deterministic
 *                order. Stable per helper. A breakpoint closes `Role` + `Skills`.
 * - `Packages` — the package documentation this persona needs for the work at hand (a focus),
 *                or what the request happens to mention. It gets its OWN breakpoint and can
 *                never invalidate the two blocks above it.
 * - `Results`  — what the earlier steps of the pipeline this call runs in produced
 *                (`ExecutionState.results`). Stable within one step, different on the
 *                next, so it sits BELOW every boundary that is cached across steps and
 *                is emitted only when a view is present.
 * - `Context`  — caller-supplied system text and project facts. Stable for one step of the work,
 *                so it sits in the project message with `Results`.
 * - `Tail`     — what belongs to ONE call: per-call skills, late packages and types. Appended to the
 *                final message after the call's payload and never cached.
 *
 * Where each block is sent is {@link PROMPT_REGIONS}.
 */
export enum PromptBlock {
  Role = 'role',
  Skills = 'skills',
  Packages = 'packages',
  Results = 'results',
  Context = 'context',
  Tail = 'tail',
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
  PromptBlock.Results,
  PromptBlock.Context,
  PromptBlock.Tail,
] as const

/**
 * Where a composed block travels in a request. Each region is stable for a different span of
 * work, so each closes on its own cache breakpoint (the tail on none):
 *
 * - `System`  — the system message: who the model is and what it may use. Stable per persona
 *               (role + skills) and per persona and story (packages).
 * - `Project` — the user turn right after the system: facts about this project and step.
 * - `Tail`    — appended to the final message, after the call's own payload.
 */
export enum PromptRegion {
  System = 'system',
  Project = 'project',
  Tail = 'tail',
}

/** The blocks of each {@link PromptRegion}, in emission order. */
export const PROMPT_REGIONS: Readonly<Record<PromptRegion, readonly PromptBlock[]>> = Object.freeze({
  [PromptRegion.System]: [PromptBlock.Role, PromptBlock.Skills, PromptBlock.Packages],
  [PromptRegion.Project]: [PromptBlock.Results, PromptBlock.Context],
  [PromptRegion.Tail]: [PromptBlock.Tail],
})

/**
 * What a part of a package's documentation is FOR — the closed vocabulary a chunked package skill
 * tags its parts with, and a {@link PromptFocus} selects them by. `library-manager` keeps a copy
 * (it cannot import this package) and a test pins that the two are equal.
 */
export enum PackagePurpose {
  View = 'view',
  Form = 'form',
  List = 'list',
  Detail = 'detail',
  Dialog = 'dialog',
  Picker = 'picker',
  Navigation = 'navigation',
  Layout = 'layout',
  Screen = 'screen',
  Theme = 'theme',
  Feedback = 'feedback',
  State = 'state',
  ClientApi = 'client-api',
  ServerApi = 'server-api',
  Data = 'data',
  Migration = 'migration',
  Query = 'query',
  Auth = 'auth',
  Consent = 'consent',
  Payment = 'payment',
  Planning = 'planning',
  Job = 'job',
  Agent = 'agent',
  Config = 'config',
  Test = 'test',
  Ops = 'ops',
}

/** Every {@link PackagePurpose}, in declaration order — declared, not derived from the enum. */
export const PACKAGE_PURPOSES: readonly PackagePurpose[] = Object.freeze([
  PackagePurpose.View, PackagePurpose.Form, PackagePurpose.List, PackagePurpose.Detail,
  PackagePurpose.Dialog, PackagePurpose.Picker, PackagePurpose.Navigation, PackagePurpose.Layout,
  PackagePurpose.Screen, PackagePurpose.Theme, PackagePurpose.Feedback, PackagePurpose.State,
  PackagePurpose.ClientApi, PackagePurpose.ServerApi, PackagePurpose.Data, PackagePurpose.Migration,
  PackagePurpose.Query, PackagePurpose.Auth, PackagePurpose.Consent, PackagePurpose.Payment,
  PackagePurpose.Planning, PackagePurpose.Job, PackagePurpose.Agent, PackagePurpose.Config,
  PackagePurpose.Test, PackagePurpose.Ops,
])

/** Sort weight of a skill that declares none — see `SkillDefinition.order`. */
export const DEFAULT_SKILL_ORDER = 100

/**
 * Conventional {@link ModelRole} for the cheap side calls the layer makes on its own
 * behalf — a relevance pick, a classification, a one-line judgement — rather than for the
 * work a caller asked for. A deployment that names its cheap tier differently points
 * `ModelPolicy.utilityRole` at its own alias; nothing else has to change.
 */
export const UTILITY_ROLE = 'utility'
