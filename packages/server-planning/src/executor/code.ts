import {
  CODE_MINT_ATTEMPTS, CodeScope, CodeStyle, CodeTaken, mintCode, TransitionAction,
} from '@owlmeans/planning'
import type {
  CodePolicy, PlanningExecContext, PlanningPlugin, PlanningScope, TransitionExecution, WorkcardDraft,
} from '@owlmeans/planning'
import type { Criteria } from '@owlmeans/resource'
import type { Workcard } from '@owlmeans/planning'
import type { PluginRegistry } from '../registry.js'
import type { Resolved } from './resolve.js'

/** The criteria a code must be unique within — the policy's scope, `parent` when there is none. */
const scopeCriteria = (
  scope: PlanningScope, type: string, parent: string | undefined, policy?: CodePolicy
): Criteria<Workcard> => ({
  entityId: scope.entityId,
  type,
  ...((policy?.uniqueWithin ?? CodeScope.Parent) === CodeScope.Parent ? { parent: parent ?? null } : {}),
}) as Criteria<Workcard>

export const takenProbe = (resolved: Resolved, scope: PlanningScope, parent: string | undefined) => {
  const base = scopeCriteria(scope, resolved.type.type, parent, resolved.type.code)

  return async (code: string): Promise<boolean> =>
    await resolved.store.cards.count({ ...base, code } as Criteria<Workcard>) > 0
}

/**
 * Step 8: the code a new card gets, or the check a changed code passes.
 *
 * A caller-supplied code is checked for uniqueness; otherwise the plugins' `mintCode` chain answers
 * (first answer wins, and is checked too); otherwise the type's policy mints one — a slug policy
 * derives it from the title. A type with no policy and no supplied code gets none.
 *
 * @throws {CodeTaken}
 */
export const assignCode = async (
  exec: TransitionExecution,
  resolved: Resolved,
  scope: PlanningScope,
  registry: PluginRegistry,
  contextOf: (plugin: PlanningPlugin) => PlanningExecContext
): Promise<TransitionExecution> => {
  const policy = resolved.type.code

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

  let code = await registry.mintCode(draft, taken, contextOf)
  if (code != null) {
    if (await taken(code)) {
      throw new CodeTaken(code)
    }
  } else {
    const count = policy.style === CodeStyle.Sequential
      ? await resolved.store.cards.count(scopeCriteria(scope, draft.type, draft.parent, policy))
      : undefined
    code = await mintCode(policy, taken, CODE_MINT_ATTEMPTS, {
      ...(policy.style === CodeStyle.Slug ? { seed: draft.title } : {}),
      ...(count != null ? { count } : {}),
    })
  }

  return { ...exec, card: { ...draft, code } }
}
