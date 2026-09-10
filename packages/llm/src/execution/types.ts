import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { InitializedService } from '@owlmeans/context'
import type {
  ExecutionEffort, ExecutionLevel, ExecutionState, FileProviderRef, Inquiry, InquiryAnswer,
  InquiryConfig, LlmPurpose, ModelConfigOverride, ModelPolicy, ModelRole, PromptPolicy,
  TaskExecutionState,
} from '@owlmeans/llm-common'
import type { LlmService, TemperatureFactory } from '../types.js'
import type { PromptService } from '../prompt/types.js'

/**
 * Runtime execution = serializable {@link ExecutionState} + attached collaborators.
 * A frozen data object with NO behavior of its own — all logic (construct, refine,
 * resolve a model, snapshot, restore) lives on {@link ExecutionService}. Passing it to
 * the next performer creates a NEW object; an execution is immutable between layers.
 *
 * Extend this interface (and {@link ExecutionState}) to carry domain context; every
 * field that is not declared a collaborator travels into the snapshot automatically.
 */
export interface Execution extends ExecutionState {
  /** Resolver for the model factory — a function so the service can be swapped/cloned. */
  models: () => LlmService
  /** Resolver for the skill registry / prompt composer. Same late-binding rationale. */
  prompts?: () => PromptService
  /** File access offered to prompt plugins. Declared a collaborator, never snapshotted. */
  files?: FileProviderRef
  outputErrors?: boolean
  captureNull?: boolean
}

export interface ProjectExecution extends Execution {
  level: ExecutionLevel.Project
}

export interface TaskExecution extends Execution {
  level: ExecutionLevel.Task
  /** The composed, JSON-safe state — recomposed on every refinement. */
  state: TaskExecutionState
}

export interface HelperExecution extends Execution {
  level: ExecutionLevel.Helper
  role: ModelRole
  /** A model already resolved against the policy (effort + overrides). */
  model: BaseChatModel
  temperatureFactory: TemperatureFactory
}

export interface ProjectExecutionInput {
  models: () => LlmService
  prompts?: () => PromptService
  files?: FileProviderRef
  policy: ModelPolicy
  purpose: LlmPurpose
  /** Baseline role and skills for the whole run. */
  prompt?: PromptPolicy
  /**
   * How this run may put a question to a person (see {@link ExecutionService.ask}). State, not a
   * collaborator — it travels into every snapshot, so a resumed run asks the same way.
   */
  inquiry?: InquiryConfig
  outputErrors?: boolean
  captureNull?: boolean
}

export interface TaskExecutionInput {
  /** Raise (or lower) the effort tier for this task and everything derived from it. */
  effort?: ExecutionEffort
  /** Skills (and optionally a role) layered on top of the project's. Skills accumulate. */
  prompt?: PromptPolicy
  /** Optional seeds for the resumable task state. */
  phase?: string
  data?: Record<string, unknown>
}

export interface HelperExecutionInput {
  /**
   * Which MODEL to use. Distinct from `prompt.role`, which is the system-prompt text
   * defining the persona — one selects hardware, the other writes the job description.
   */
  role: ModelRole
  /** Local effort bump without escalating the whole branch. */
  effort?: ExecutionEffort
  /** The helper's persona and its own skills, layered on top of the task's. */
  prompt?: PromptPolicy
  /** Refines `purpose.dedication`. */
  dedication?: string
  /**
   * Initial output-token budget for this helper's model (`ModelConfig.maxTokens`), for
   * work whose ONE answer is genuinely large — a whole source file rather than a decision.
   *
   * The role's preset value sizes the common case; a helper that routinely needs more
   * would otherwise spend its first attempt producing a truncated answer and only reach a
   * workable budget through the retry escalator, which doubles from this number. Clamped
   * to the provider's `maxOutput` and preserved across `temperatureFactory`.
   */
  output?: number
}

/** Collaborators re-attached to a state that was restored from storage. */
export interface RestoreCollaborators {
  models?: () => LlmService
  prompts?: () => PromptService
  files?: FileProviderRef
}

/**
 * What a performer wants to know before it acts. Runtime-only — never snapshotted, so it
 * carries whatever the advisor and its callers agree on.
 */
export interface AdviceRequest {
  /** Which advisor is being asked; an advisor that does not own this kind returns null. */
  kind: string
  /** The work at hand, in the caller's own words — normally the assignment text. */
  task: string
  /** Anything that narrows the answer (a subproject, a path prefix, an entity). */
  hints?: Record<string, unknown>
}

/**
 * Extension seam. A plugin ANSWERS a performer's question about its surroundings.
 *
 * It used to carry a checkpoint pair as well (`onCheckpoint`/`onRestore`), and that is gone: an
 * execution is a bundle of collaborators and domain context, not a workflow position, and the only
 * position it ever carried was three optional fields nothing ever read back. Recoverable work is a
 * PIPELINE — `@owlmeans/agent`'s `makePipeline` — whose steps are named, whose state is scalars and
 * keys, and whose run row is a single authority on where it stands. Two mechanisms answering "where
 * is this run" is two half-truths, which is exactly what this deletion removes.
 */
export interface ExecutionPlugin {
  /**
   * Identity for de-duplication. A plugin registered twice — two `append*` calls composing the
   * same layer — would otherwise answer twice, and the first usable answer wins, so the duplicate
   * is silent rather than loud.
   */
  alias?: string
  /**
   * Answer a performer's question about the project it is working in. Return the text to
   * hand the model, or `null` when this plugin does not own the request's `kind` — or
   * cannot answer it. Advice is advisory: a `null` never blocks the work.
   */
  advise?: (exec: Execution, request: AdviceRequest) => Promise<string | null>
}

/**
 * The set of domain types an {@link ExecutionService} works with. A consumer declares
 * its own shape (extending each member) and instantiates the service generic with it,
 * which keeps the method signatures precise without redeclaring — and therefore without
 * the contravariance problem that narrowing an inherited method signature would cause.
 */
export interface ExecutionShape {
  exec: Execution
  project: ProjectExecution
  task: TaskExecution
  helper: HelperExecution
  projectInput: ProjectExecutionInput
  taskInput: TaskExecutionInput
  helperInput: HelperExecutionInput
  purpose: LlmPurpose
  collaborators: RestoreCollaborators
}

/**
 * Standard OwlMeans context service. Every construction/refinement method returns a new,
 * `Object.freeze`d object — executions are immutable between performers.
 */
export interface ExecutionService<S extends ExecutionShape = ExecutionShape> extends InitializedService {
  // Construction / refinement (immutable; each returns a frozen object)
  root: (input: S['projectInput']) => S['project']
  forTask: (parent: S['project'], input: S['taskInput']) => S['task']
  forHelper: (parent: S['exec'], input: S['helperInput']) => S['helper']
  derive: <E extends S['exec']>(exec: E, patch: Partial<E>) => E
  withPurpose: <E extends S['exec']>(exec: E, patch: Partial<S['purpose']>) => E
  escalate: <E extends S['exec']>(exec: E, patch: Partial<ModelPolicy>) => E

  // Model resolution (policy-aware)
  model: (exec: S['exec'], role?: ModelRole, override?: ModelConfigOverride) => BaseChatModel
  /**
   * The cheap model for work that is not the work — a relevance pick, a classification, a
   * one-line judgement a plugin needs before the real call can be shaped.
   *
   * Resolves `policy.utilityRole ?? UTILITY_ROLE` at {@link ExecutionEffort.Economy} through
   * the SAME ladder as {@link model}, so `roleOverrides` and `modelOverrides` govern it
   * exactly as they govern every other role. The effort floor is local: the execution it
   * was asked on keeps its own tier.
   */
  utility: (exec: S['exec'], override?: ModelConfigOverride) => BaseChatModel
  /**
   * A factory that re-resolves the same role at another temperature. `baseOverride` is
   * layered UNDER the temperature patch, so a caller-chosen budget (see
   * `HelperExecutionInput.output`) survives the refinement.
   */
  temperatureFactory: (
    exec: S['exec'], role?: ModelRole, baseOverride?: ModelConfigOverride
  ) => TemperatureFactory

  // Serialization
  /** Register an execution plugin (advice). Seated by `alias` when it carries one. */
  use: (plugin: ExecutionPlugin) => void
  /**
   * The JSON-safe half of an execution — everything that is not a collaborator.
   *
   * A transport-level convenience, not a workflow position: nothing here says where a run has got
   * to, and nothing should. See {@link ExecutionPlugin}.
   */
  snapshot: (exec: S['exec']) => ExecutionState
  restore: (state: ExecutionState, collaborators?: S['collaborators']) => S['exec']

  /**
   * Put a question to whoever is behind this execution, under its own policy.
   *
   * `ask` → the seated transport (and the answer comes back capped to
   * `DEFAULT_INQUIRY_ANSWER_CHARS`); `default` → the question's own default, or a decline, which
   * the caller is expected to RECORD as an assumption; `refuse` → `InquiryDeclined`. No config at
   * all means `default`: a run that was never given a channel must never block on one.
   *
   * Throws `InquiryUnavailable` when the policy is `ask` and nothing is seated under the
   * execution's transport key. Wire it through `executionInquiry` to read that as "nobody is
   * there" instead.
   */
  ask: (exec: S['exec'], inquiry: Inquiry, signal?: AbortSignal) => Promise<InquiryAnswer>

  /**
   * Ask the registered plugins about the project this execution runs in. Plugins are
   * consulted in registration order and the FIRST usable answer wins, so one advisor owns
   * each `kind` rather than several concatenating half-answers. Never throws: a plugin
   * that fails is skipped, and `null` means nobody answered.
   */
  advise: (exec: S['exec'], request: AdviceRequest) => Promise<string | null>
}

export interface ExecutionServiceOptions {
  /**
   * Execution fields that are collaborators, not state — excluded from every snapshot.
   * Merged with the package's own {@link COLLABORATOR_KEYS}.
   */
  collaboratorKeys?: string[]
}

export interface WithExecutionService<S extends ExecutionShape = ExecutionShape> {
  executions: () => ExecutionService<S>
}
