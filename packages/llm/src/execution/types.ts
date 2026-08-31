import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { InitializedService } from '@owlmeans/context'
import type {
  ExecutionEffort, ExecutionLevel, ExecutionState, FileProviderRef, LlmPurpose,
  ModelConfigOverride, ModelPolicy, ModelRole, PromptPolicy, TaskExecutionState,
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
 * Extension seam. A plugin observes flow boundaries (via
 * {@link ExecutionService.checkpoint}) and can persist/enqueue the JSON-safe
 * {@link ExecutionState}, or supply one back on resume; it may also ANSWER a performer's
 * question about its surroundings (`advise`). This package ships NO concrete
 * implementation — with no plugin registered, both seams are no-ops.
 */
export interface ExecutionPlugin {
  /** Fired at a flow boundary with a JSON-safe snapshot; persist/enqueue as desired. */
  onCheckpoint?: (state: ExecutionState, exec: Execution, key?: string) => Promise<void>
  /** Resume hook: return a previously persisted state for `key`, or `null`. */
  onRestore?: (key: string) => Promise<ExecutionState | null>
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
   * A factory that re-resolves the same role at another temperature. `baseOverride` is
   * layered UNDER the temperature patch, so a caller-chosen budget (see
   * `HelperExecutionInput.output`) survives the refinement.
   */
  temperatureFactory: (
    exec: S['exec'], role?: ModelRole, baseOverride?: ModelConfigOverride
  ) => TemperatureFactory

  // Resilience
  /** Register an execution plugin (checkpoint/resume, advice). No-op seam until provided. */
  use: (plugin: ExecutionPlugin) => void
  /** Snapshot `exec` and dispatch it to every registered plugin. No-op if none. */
  checkpoint: (exec: S['exec'], key?: string) => Promise<void>
  snapshot: (exec: S['exec']) => ExecutionState
  restore: (state: ExecutionState, collaborators?: S['collaborators']) => S['exec']

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
