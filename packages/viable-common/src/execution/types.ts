import type {
  ExecutionState as LlmExecutionState, TaskExecutionState as LlmTaskExecutionState,
} from '@owlmeans/llm-common'
import type { PurposeMetadata } from '../agent/types.js'
import type { AgentProject, Entity, UserStory } from '../ba/types.js'
import type { UXTransition } from '../ux/types.js'
import type { SeniorityMode } from '../consts.js'

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
  project?: AgentProject
  entities?: Entity[]
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
  transitions?: UXTransition[]
}
