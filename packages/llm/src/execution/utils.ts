import { ExecutionLevel } from '@owlmeans/llm-common'
import type {
  ExecutionEffort, ExecutionState, ModelConfigOverride, ModelConfigPatch,
  ModelPolicy, ModelRole, PromptPolicy, TaskExecutionState,
} from '@owlmeans/llm-common'
import { EFFORT_TABLE } from '../consts.js'
import type { Execution, TaskExecution } from './types.js'

export const freeze = <T extends object>(o: T): Readonly<T> => Object.freeze(o)

/** Overlay a partial policy onto a base one. Override maps are merged, not replaced. */
export const mergePolicy = (base: ModelPolicy, patch: Partial<ModelPolicy>): ModelPolicy => {
  const utilityRole = patch.utilityRole ?? base.utilityRole

  return {
    effort: patch.effort ?? base.effort,
    roleOverrides: patch.roleOverrides != null || base.roleOverrides != null
      ? { ...base.roleOverrides, ...patch.roleOverrides }
      : undefined,
    modelOverrides: patch.modelOverrides != null || base.modelOverrides != null
      ? { ...base.modelOverrides, ...patch.modelOverrides }
      : undefined,
    // Added only when it exists, unlike the maps above: a project that never names a
    // cheap tier must not gain a `utilityRole` key it would then carry into every snapshot.
    ...(utilityRole != null ? { utilityRole } : {}),
  }
}

/**
 * Overlay a prompt policy onto the one inherited from the parent level.
 *
 * Skills ACCUMULATE — a task adds to what the project declared, a helper adds to the
 * task — because that is how a capability set is built up as work narrows. The role is
 * replaced instead: the deepest level that names one owns the persona.
 *
 * The union preserves first-seen order and de-duplicates, so the composed prompt is
 * byte-identical no matter how many levels contributed the same skill.
 */
export const mergePrompt = (
  base: PromptPolicy | undefined,
  patch: PromptPolicy | undefined,
): PromptPolicy | undefined => {
  if (base == null && patch == null) {
    return undefined
  }
  const skills = [...new Set([...(base?.skills ?? []), ...(patch?.skills ?? [])])]

  return {
    ...base,
    ...patch,
    ...(base?.role != null || patch?.role != null ? { role: patch?.role ?? base?.role } : {}),
    ...(skills.length > 0 ? { skills } : {}),
  }
}

/** Apply the policy's role→role remap. */
export const resolveRole = (policy: ModelPolicy, role: ModelRole): ModelRole =>
  (policy.roleOverrides?.[role] as ModelRole | undefined) ?? role

export const effortPatch = (effort: ExecutionEffort): ModelConfigPatch => EFFORT_TABLE[effort]

/** Normalize a {@link ModelConfigOverride} (alias or patch) to a patch. */
export const resolveModelConfig = (override: ModelConfigOverride): ModelConfigPatch =>
  typeof override === 'string' ? { preset: override } : override

/**
 * Merge effort < policy.modelOverride < call-site override into a single patch.
 * Any field present in a higher-precedence source wins.
 */
export const mergeOverride = (
  effortBase: ModelConfigPatch,
  policyOverride: ModelConfigOverride | undefined,
  callOverride: ModelConfigOverride | undefined,
): ModelConfigPatch => {
  const policy = policyOverride != null ? resolveModelConfig(policyOverride) : {}
  const call = callOverride != null ? resolveModelConfig(callOverride) : {}
  return { ...effortBase, ...policy, ...call }
}

// --- Serialization ---

/**
 * Project an execution down to its JSON-safe state: every own field except the declared
 * collaborators. Domain fields added by a consumer are carried through automatically,
 * which is what lets an extended execution be persisted without extra wiring.
 */
export const composeExecState = (exec: Execution, collaboratorKeys: string[]): ExecutionState => {
  const state: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(exec)) {
    if (!collaboratorKeys.includes(key)) {
      state[key] = value
    }
  }
  return state as unknown as ExecutionState
}

/**
 * Same as {@link composeExecState}, plus the resumable task fields carried over from the
 * execution's PRIOR state (they live only there — `phase`/`cursor`/`completed`/`data` are
 * advanced by the workflow, not by refinement).
 */
export const composeTaskState = (exec: TaskExecution, collaboratorKeys: string[]): TaskExecutionState => {
  const base = composeExecState(exec, collaboratorKeys) as TaskExecutionState
  const prior = exec.state ?? ({} as TaskExecutionState)
  return {
    ...base,
    level: ExecutionLevel.Task,
    phase: prior.phase,
    completed: prior.completed,
    cursor: prior.cursor,
    data: prior.data,
  }
}
