import type {
  ExecutionEffort, ExecutionState, ModelConfigOverride, ModelConfigPatch, ModelPolicy, ModelRole, PromptPolicy,
  TaskExecutionState,
} from '@owlmeans/llm-common'
import { executionPolicyHelper } from './policy.js'
import { executionStateHelper } from './state.js'
import type { Execution, TaskExecution } from './types.js'

/** @deprecated compat:factory-refactor — use `executionStateHelper.freeze(…)` */
export const freeze = <T extends object>(o: T): Readonly<T> => executionStateHelper.freeze(o)

/** @deprecated compat:factory-refactor — use `executionPolicyHelper.mergePolicy(…)` */
export const mergePolicy = (base: ModelPolicy, patch: Partial<ModelPolicy>): ModelPolicy =>
  executionPolicyHelper.mergePolicy(base, patch)

/** @deprecated compat:factory-refactor — use `executionPolicyHelper.mergePrompt(…)` */
export const mergePrompt = (base: PromptPolicy | undefined, patch: PromptPolicy | undefined): PromptPolicy | undefined =>
  executionPolicyHelper.mergePrompt(base, patch)

/** @deprecated compat:factory-refactor — use `executionPolicyHelper.resolveRole(…)` */
export const resolveRole = (policy: ModelPolicy, role: ModelRole): ModelRole => executionPolicyHelper.resolveRole(policy, role)

/** @deprecated compat:factory-refactor — use `executionPolicyHelper.effortPatch(…)` */
export const effortPatch = (effort: ExecutionEffort): ModelConfigPatch => executionPolicyHelper.effortPatch(effort)

/** @deprecated compat:factory-refactor — use `executionPolicyHelper.resolveModelConfig(…)` */
export const resolveModelConfig = (override: ModelConfigOverride): ModelConfigPatch =>
  executionPolicyHelper.resolveModelConfig(override)

/** @deprecated compat:factory-refactor — use `executionPolicyHelper.mergeOverride(…)` */
export const mergeOverride = (
  effortBase: ModelConfigPatch,
  policyOverride: ModelConfigOverride | undefined,
  callOverride: ModelConfigOverride | undefined,
): ModelConfigPatch => executionPolicyHelper.mergeOverride(effortBase, policyOverride, callOverride)

/** @deprecated compat:factory-refactor — use `executionStateHelper.composeExecState(…)` */
export const composeExecState = (exec: Execution, collaboratorKeys: string[]): ExecutionState =>
  executionStateHelper.composeExecState(exec, collaboratorKeys)

/** @deprecated compat:factory-refactor — use `executionStateHelper.composeTaskState(…)` */
export const composeTaskState = (exec: TaskExecution, collaboratorKeys: string[]): TaskExecutionState =>
  executionStateHelper.composeTaskState(exec, collaboratorKeys)
