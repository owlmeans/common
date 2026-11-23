import { CODE_MINT_ATTEMPTS, codeHelper, CodeScope, CodeStyle, CodeTaken, FORMER_CODES_FIELD, TransitionAction, type CodePolicy, type PlanningExecContext, type PlanningPlugin, type PlanningScope, type TransitionExecution, type Workcard, type WorkcardDraft } from '@owlmeans/planning'
import type { Criteria } from '@owlmeans/resource'
import type { PluginRegistry } from '../types.js'
import type { CodeUtils } from './code/types.js'
import type { Resolved } from './types.js'

export const createCodeUtils = (): CodeUtils => {
  /** The criteria a code must be unique within — the policy's scope, `parent` when there is none. */
  const scopeCriteria = (
    scope: PlanningScope, type: string, parent: string | undefined, policy?: CodePolicy
  ): Criteria<Workcard> => ({
    entityId: scope.entityId,
    type,
    ...((policy?.uniqueWithin ?? CodeScope.Parent) === CodeScope.Parent ? { parent: parent ?? null } : {}),
  }) as Criteria<Workcard>

  /** Is a code taken within the scope the type's policy names (its parent when it names none)? */
  const takenProbe = (resolved: Resolved, scope: PlanningScope, parent: string | undefined): (code: string) => Promise<boolean> => {
    const base = scopeCriteria(scope, resolved.type.type, parent, resolved.type.code)

    return async (code: string): Promise<boolean> =>
      await resolved.store.cards.count({ ...base, code } as Criteria<Workcard>) > 0
  }

  /** Mint under a policy: the plugins' `mintCode` chain first (its answer checked), else the policy itself. */
  const mint = async (
    draft: WorkcardDraft, policy: CodePolicy, taken: (code: string) => Promise<boolean>, resolved: Resolved,
    scope: PlanningScope, registry: PluginRegistry, contextOf: (plugin: PlanningPlugin) => PlanningExecContext
  ): Promise<string> => {
    const code = await registry.mintCode(draft, taken, contextOf)
    if (code != null) {
      if (await taken(code)) {
        throw new CodeTaken(code)
      }
      return code
    }
    const count = policy.style === CodeStyle.Sequential
      ? await resolved.store.cards.count(scopeCriteria(scope, draft.type, draft.parent, policy))
      : undefined
    return await codeHelper.mintCode(policy, taken, CODE_MINT_ATTEMPTS, {
      ...(policy.style === CodeStyle.Slug ? { seed: draft.title } : {}),
      ...(count != null ? { count } : {}),
    })
  }

  /**
   * A retype's code: kept when the new type has no policy, or when it carries the policy's prefix and
   * is free within the new type's scope; otherwise minted under the new policy, the old code appended
   * to `fields.formerCodes`.
   */
  const retypeCode = async (
    exec: TransitionExecution,
    resolved: Resolved,
    scope: PlanningScope,
    registry: PluginRegistry,
    contextOf: (plugin: PlanningPlugin) => PlanningExecContext
  ): Promise<TransitionExecution> => {
    const card = resolved.card!
    const target = resolved.target!
    const policy = target.code
    if (policy == null) {
      return exec
    }
    const taken = takenProbe({ ...resolved, type: target }, scope, card.parent)
    if (!codeHelper.remintsOn(policy, card.code) && !await taken(card.code!)) {
      return exec
    }
    const draft: WorkcardDraft = {
      kind: card.kind, type: target.type, title: exec.changes?.title ?? card.title,
      ...(card.parent != null ? { parent: card.parent } : {}), parents: card.parents,
    }
    const code = await mint(draft, policy, taken, resolved, scope, registry, contextOf)
    const former = card.code != null && card.code !== ''
      ? { fields: { ...exec.changes?.fields, [FORMER_CODES_FIELD]: codeHelper.formerCodesOf(card.fields, card.code) } }
      : {}

    return { ...exec, changes: { ...exec.changes, code, ...former } }
  }

  const assignCode = async (
    exec: TransitionExecution,
    resolved: Resolved,
    scope: PlanningScope,
    registry: PluginRegistry,
    contextOf: (plugin: PlanningPlugin) => PlanningExecContext
  ): Promise<TransitionExecution> => {
    const policy = resolved.type.code

    if (exec.action === TransitionAction.Retype) {
      return await retypeCode(exec, resolved, scope, registry, contextOf)
    }

    if (exec.action !== TransitionAction.Create) {
      const code = exec.changes?.code
      if (code != null && code !== resolved.card?.code
        && await takenProbe(resolved, scope, exec.changes?.parent ?? resolved.card?.parent)(code)) {
        throw new CodeTaken(code)
      }
      return exec
    }

    const draft = exec.card as WorkcardDraft
    const taken = takenProbe(resolved, scope, draft.parent)
    if (draft.code != null && draft.code !== '') {
      if (await taken(draft.code)) {
        throw new CodeTaken(draft.code)
      }
      return exec
    }
    if (policy == null) {
      return exec
    }

    const code = await mint(draft, policy, taken, resolved, scope, registry, contextOf)

    return { ...exec, card: { ...draft, code } }
  }

  return { assignCode }
}

export const codeUtils = createCodeUtils()
