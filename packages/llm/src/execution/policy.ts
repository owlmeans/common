import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type {
  ExecutionEffort, ModelConfigOverride, ModelConfigPatch, ModelEffort, ModelPolicy, ModelRole, PromptPolicy,
} from '@owlmeans/llm-common'
import { EFFORT_TABLE } from '../consts.js'
import { llmPluginRegistry } from '../plugins/registry.js'
import { configUtils } from '../utils/config.js'
import { effortUtils } from '../utils/effort.js'
import type { ExecutionPolicyHelper } from './policy/types.js'

export const createExecutionPolicyHelper = (): ExecutionPolicyHelper => {
  const mergePolicy = (base: ModelPolicy, patch: Partial<ModelPolicy>): ModelPolicy => {
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

  const mergePrompt = (
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

  const resolveRole = (policy: ModelPolicy, role: ModelRole): ModelRole =>
    (policy.roleOverrides?.[role] as ModelRole | undefined) ?? role

  const effortPatch = (effort: ExecutionEffort): ModelConfigPatch => EFFORT_TABLE[effort]

  const raisedEffort = (model: BaseChatModel, steps: number): ModelEffort | undefined => {
    const config = configUtils.readConfig(model)
    const support = llmPluginRegistry.effortSupportOf(config)
    return support != null ? effortUtils.raiseEffort(support, config.effort, steps) : undefined
  }

  const resolveModelConfig = (override: ModelConfigOverride): ModelConfigPatch =>
    typeof override === 'string' ? { preset: override } : override

  const mergeOverride = (
    effortBase: ModelConfigPatch,
    policyOverride: ModelConfigOverride | undefined,
    callOverride: ModelConfigOverride | undefined,
  ): ModelConfigPatch => {
    const policy = policyOverride != null ? resolveModelConfig(policyOverride) : {}
    const call = callOverride != null ? resolveModelConfig(callOverride) : {}
    return { ...effortBase, ...policy, ...call }
  }

  return { mergePolicy, mergePrompt, resolveRole, effortPatch, raisedEffort, resolveModelConfig, mergeOverride }
}

export const executionPolicyHelper = createExecutionPolicyHelper()
