import type { StackRef } from '../stack/types.js'
import type {
  ExecutionState as LlmExecutionState, TaskExecutionState as LlmTaskExecutionState,
} from '@owlmeans/llm-common'
import type { PurposeMetadata } from '../agent/types.js'
import type { AgentProject, Entity, UserStory } from '../ba/types.js'
import type { UXTransition } from '../ux/types.js'
import type { SeniorityMode } from '../consts.js'
import type { ViableProjectCard, ViableWorkcard } from '../planning/types.js'
import type { OriginTenancyFacts } from '../areas/types.js'
import type { WorkMode } from './consts.js'

/**
 * Model-selection contracts are owned by `@owlmeans/llm-common` — the JSON-safe config
 * patch, the alias-or-patch override, and the inheritable policy whose resolution
 * precedence is roleOverride → modelOverride → effort tier → `LlmService.getModel`.
 * Viable adds no fields to them, so they are re-exported rather than redeclared.
 */
export type { ModelConfigPatch, ModelConfigOverride, ModelPolicy } from '@owlmeans/llm-common'

/**
 * Serializable execution state — no functions, no `FileHelper`, no models.
 * The runtime `Execution` (library) = this state + attached collaborators.
 * Extends the generic `@owlmeans/llm-common` state with the viable domain context
 * every performer needs.
 */
export interface ExecutionState extends LlmExecutionState {
  purpose: PurposeMetadata
  slot?: string
  projectId?: string
  entityId?: string
  /** The brief the run reads — assembled from {@link ExecutionState.projectCard} and its specifications. */
  project?: AgentProject
  /**
   * The project card the run acts on, as plain data.
   *
   * Carried beside the brief rather than in place of it: a generator reads the brief, while
   * whatever writes back — a status transition, a specification — needs the card's id and head.
   */
  projectCard?: ViableProjectCard
  entities?: Entity[]
  /**
   * Which blueprint this run is building against, as an id plus an override patch.
   *
   * A REFERENCE and never the resolved blueprint: an execution state is written into the pipeline
   * run row at every step boundary, and that row holds keys, never artifacts. The resolved value
   * is reconstructed from these two fields whenever a helper asks for it, which also means a
   * blueprint the platform has since corrected reaches a resumed run rather than the copy that was
   * frozen into it.
   *
   * Absent means the platform default — every project created before blueprints existed.
   */
  blueprint?: StackRef
  /**
   * What a CONVERTED project's origin called its tenant: the label, the key fields it keyed every
   * record by, its records of people. Facts, never a map — derived by the platform from the project
   * card's `fields.tenancy.origin` wherever it builds a root execution, so a fresh, resumed,
   * free-flight or story-format run carries the same words with no file read. Absent for every
   * project that was not converted from a tenanted origin, and while no tenancy flag is on.
   */
  originTenancy?: OriginTenancyFacts
  /**
   * How this run's pipeline steps work — linear recipes or hybrid mini agents. State, not a
   * collaborator: it rides every snapshot and reaches every derived execution through the spread,
   * so a resumed run keeps the mode it started in. Absent is hybrid.
   */
  work?: WorkPolicy
}

/** The work policy a run carries: today only its mode. */
export interface WorkPolicy {
  mode: WorkMode
}

/**
 * Adds viable's task context to the generic resumable fields (`phase` / `completed` /
 * `cursor` / `data`). The base fields come from viable's own {@link ExecutionState},
 * so only the resumable half of the llm state is mixed in.
 */
export interface TaskExecutionState
  extends ExecutionState, Omit<LlmTaskExecutionState, keyof LlmExecutionState> {
  mode?: SeniorityMode
  story?: UserStory
  /** The story card the task develops, as plain data — the aggregate above is derived from it. */
  card?: ViableWorkcard
  transitions?: UXTransition[]
  /**
   * The app this task works in, by name (`AppDescriptor.name`). Absent — every task before apps
   * existed, and every task of a one-app project — is `main`.
   */
  app?: string
}
