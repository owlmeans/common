import {
  cardHelper, DEFAULT_COMMIT_TIMEOUT, PlanningForbidden, TransitionAction, WorkcardKind,
} from '@owlmeans/planning'
import type {
  ExecuteOptions, ExecuteRequest, PlanningFacade, PlanningScope, TransitionExecution, Workcard,
} from '@owlmeans/planning'
import { creatorHelper } from '../executor/creator.js'
import type { PlanningAccess } from '../types.js'
import { makePlanningAccessModel } from '../utils/access.js'
import type { ExecutionHelper } from './execution/types.js'

export const createExecutionHelper = (): ExecutionHelper => {
  const wireExecution = (body: ExecuteRequest, scope: PlanningScope): TransitionExecution => {
    const { wait: _wait, timeout: _timeout, actor: _actor, ...exec } = body
    if (exec.action === TransitionAction.Create && exec.card != null && typeof exec.card === 'object') {
      const { createdBy: _createdBy, ...draft } = exec.card
      exec.card = draft
    }
    return creatorHelper.withCreator(exec, scope)
  }

  const executeOptionsOf = (body: Pick<ExecuteRequest, 'wait' | 'timeout'>, maxPoll: number): ExecuteOptions => {
    const ceiling = maxPoll * 1000
    if (body.wait !== true) {
      return {}
    }
    const asked = Number(body.timeout ?? DEFAULT_COMMIT_TIMEOUT)
    return { wait: true, timeout: Math.min(Number.isFinite(asked) && asked > 0 ? asked : DEFAULT_COMMIT_TIMEOUT, ceiling) }
  }

  const assertExecutionWrites = async (
    facade: PlanningFacade, exec: TransitionExecution, access?: PlanningAccess
  ): Promise<void> => {
    if (access?.writes == null) {
      return
    }
    const model = makePlanningAccessModel(access)
    const admitted = async (card: Workcard): Promise<boolean> => {
      if (model.writableIn(card)) {
        return true
      }
      if (!cardHelper.isSpecification(card) || card.parent == null) {
        return false
      }
      const parent = await facade.cards.load(card.parent)
      return parent == null || model.writableIn(parent)
    }

    if (exec.action === TransitionAction.Create && exec.card != null && typeof exec.card === 'object') {
      if (exec.card.kind === WorkcardKind.Project) {
        return
      }
      const parents = cardHelper.normalizeParents(exec.card.parent, exec.card.parents)
      if (parents.length === 0) {
        throw new PlanningForbidden('writes:root')
      }
      for (const id of parents) {
        const parent = await facade.cards.load(id)
        if (parent != null && !await admitted(parent)) {
          throw new PlanningForbidden(`writes:${id}`)
        }
      }
      return
    }
    if (typeof exec.card === 'string' && exec.card !== '') {
      const card = await facade.cards.load(exec.card)
      if (card != null && !await admitted(card)) {
        throw new PlanningForbidden(`writes:${exec.card}`)
      }
    }
  }

  const assertExecutionGranted = async (
    facade: PlanningFacade, exec: TransitionExecution, access?: PlanningAccess
  ): Promise<void> => {
    await assertExecutionWrites(facade, exec, access)
    if (access?.grants == null) {
      return
    }
    const model = makePlanningAccessModel(access)
    if (exec.action === TransitionAction.Create && typeof exec.card === 'object' && exec.card?.kind === WorkcardKind.Project) {
      model.assertGranted('createProjects', cardHelper.normalizeParents(exec.card.parent, exec.card.parents)[0])
      return
    }
    if (exec.action === TransitionAction.Delete && typeof exec.card === 'string') {
      const card = await facade.cards.load(exec.card)
      if (card != null && cardHelper.isProject(card)) {
        model.assertGranted('deleteProjects', card.id)
      }
    }
  }

  return { wireExecution, executeOptionsOf, assertExecutionWrites, assertExecutionGranted }
}

export const executionHelper = createExecutionHelper()
