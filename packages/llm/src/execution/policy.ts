import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type {
  CacheTtl, CacheTtlPolicy, ExecutionEffort, ModelConfigOverride, ModelConfigPatch, ModelEffort,
  ModelPolicy, ModelRole, PromptFocus, PromptPolicy,
} from '@owlmeans/llm-common'
import { EFFORT_TABLE } from '../consts.js'
import { llmPluginRegistry } from '../plugins/registry.js'
import { configUtils } from '../utils/config.js'
import { effortUtils } from '../utils/effort.js'
import { markUtils } from '../utils/marks.js'
import { FOCUS_LIST_KEYS } from './policy/consts.js'
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

  const mergeFocus = (
    base: PromptFocus | undefined,
    patch: PromptFocus | undefined,
  ): PromptFocus | undefined => {
    if (base == null && patch == null) {
      return undefined
    }
    const focus: PromptFocus = {}
    for (const key of FOCUS_LIST_KEYS) {
      if (base?.[key] != null || patch?.[key] != null) {
        (focus as Record<string, string[]>)[key] = [...new Set<string>([...(base?.[key] ?? []), ...(patch?.[key] ?? [])])]
      }
    }
    const late = patch?.late ?? base?.late
    if (late != null) {
      focus.late = late
    }

    return focus
  }

  const mergeTtl = (
    base: CacheTtl | CacheTtlPolicy | undefined,
    patch: CacheTtl | CacheTtlPolicy | undefined,
  ): CacheTtl | CacheTtlPolicy | undefined => {
    if (patch == null || base == null || typeof patch === 'string') {
      return patch ?? base
    }

    return { ...markUtils.ttlPolicyOf(base), ...patch }
  }

  const mergePrompt = (
    base: PromptPolicy | undefined,
    patch: PromptPolicy | undefined,
  ): PromptPolicy | undefined => {
    if (base == null && patch == null) {
      return undefined
    }
    const { focus: _baseFocus, cacheTtl: _baseTtl, ...baseRest } = base ?? {}
    const { focus: _patchFocus, cacheTtl: _patchTtl, ...patchRest } = patch ?? {}
    const skills = [...new Set([...(base?.skills ?? []), ...(patch?.skills ?? [])])]
    const focus = mergeFocus(base?.focus, patch?.focus)
    const cacheTtl = mergeTtl(base?.cacheTtl, patch?.cacheTtl)

    return {
      ...baseRest,
      ...patchRest,
      ...(base?.role != null || patch?.role != null ? { role: patch?.role ?? base?.role } : {}),
      ...(skills.length > 0 ? { skills } : {}),
      // Added only when present, so a policy that never names one carries no key into a snapshot.
      ...(focus != null ? { focus } : {}),
      ...(cacheTtl != null ? { cacheTtl } : {}),
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

  return {
    mergePolicy, mergePrompt, mergeFocus, resolveRole, effortPatch, raisedEffort, resolveModelConfig, mergeOverride,
  }
}

export const executionPolicyHelper = createExecutionPolicyHelper()
