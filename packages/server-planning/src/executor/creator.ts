import { PlanningError, TransitionAction, type PlanningScope, type TransitionExecution } from '@owlmeans/planning'
import { CREATOR } from './consts.local.js'
import type { CreatorHelper } from './creator/types.js'

const named = (value?: string | null): value is string => value != null && value !== ''

export const createCreatorHelper = (): CreatorHelper => {
  const creatorOf = (scope: PlanningScope): string | undefined =>
    [scope.profileId, scope.userId, scope.actor?.profileId, scope.actor?.userId].find(named)

  const withCreator = (exec: TransitionExecution, scope: PlanningScope): TransitionExecution => {
    if (exec.action !== TransitionAction.Create || exec.card == null || typeof exec.card !== 'object') {
      return exec
    }
    const creator = named(exec.card.createdBy) ? exec.card.createdBy : creatorOf(scope)
    return { ...exec, card: { ...exec.card,
      ...(creator != null ? { createdBy: creator } : {}),
      ...(exec.card.reporter == null && scope.assigneeId != null ? { reporter: scope.assigneeId } : {}),
      ...(exec.card.assignee == null && scope.defaultAssigneeId != null ? { assignee: scope.defaultAssigneeId } : {}),
    } }
  }

  const assertCreatorFixed = (exec: TransitionExecution): void => {
    if ((exec.changes as Record<string, unknown> | undefined)?.[CREATOR] !== undefined
      || (exec.unset ?? []).some(path => path.split('.')[0] === CREATOR)) {
      throw new PlanningError(`immutable:${CREATOR}`)
    }
  }

  return { creatorOf, withCreator, assertCreatorFixed }
}

export const creatorHelper = createCreatorHelper()

/** @deprecated compat:factory-refactor — use `creatorHelper.creatorOf(…)` */
export const creatorOf = (scope: PlanningScope): string | undefined => creatorHelper.creatorOf(scope)

/** @deprecated compat:factory-refactor — use `creatorHelper.withCreator(…)` */
export const withCreator = (exec: TransitionExecution, scope: PlanningScope): TransitionExecution =>
  creatorHelper.withCreator(exec, scope)

/** @deprecated compat:factory-refactor — use `creatorHelper.assertCreatorFixed(…)` */
export const assertCreatorFixed = (exec: TransitionExecution): void => creatorHelper.assertCreatorFixed(exec)
