import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type {
  ExecutionEffort, ModelConfigOverride, ModelConfigPatch, ModelEffort, ModelPolicy, ModelRole, PromptPolicy,
} from '@owlmeans/llm-common'

/** How an execution's model policy and prompt policy are layered and resolved. */
export interface ExecutionPolicyHelper {
  /** Overlay a partial policy onto a base one. Override maps are merged, not replaced. */
  mergePolicy: (base: ModelPolicy, patch: Partial<ModelPolicy>) => ModelPolicy
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
  mergePrompt: (base: PromptPolicy | undefined, patch: PromptPolicy | undefined) => PromptPolicy | undefined
  /** Apply the policy's role→role remap. */
  resolveRole: (policy: ModelPolicy, role: ModelRole) => ModelRole
  effortPatch: (effort: ExecutionEffort) => ModelConfigPatch
  /**
   * The effort `steps` levels above what `model` was built with (its model's default when it
   * declares none), or `undefined` when that model accepts no effort.
   */
  raisedEffort: (model: BaseChatModel, steps: number) => ModelEffort | undefined
  /** Normalize a {@link ModelConfigOverride} (alias or patch) to a patch. */
  resolveModelConfig: (override: ModelConfigOverride) => ModelConfigPatch
  /**
   * Merge effort < policy.modelOverride < call-site override into a single patch.
   * Any field present in a higher-precedence source wins.
   */
  mergeOverride: (
    effortBase: ModelConfigPatch,
    policyOverride: ModelConfigOverride | undefined,
    callOverride: ModelConfigOverride | undefined,
  ) => ModelConfigPatch
}
