import { handlers } from '@owlmeans/server-api'
import {
  DEFAULT_COMMIT_TIMEOUT, isProject, isSpecification, MAX_COMMIT_POLL, normalizeParents, PlanningForbidden,
  TransitionAction, WorkcardKind,
} from '@owlmeans/planning'
import type {
  ExecuteOptions, ExecuteRequest, PlanningFacade, PlanningProtocols, PlanningScope, TransitionExecution,
  TransitionReceiptView, Workcard,
} from '@owlmeans/planning'
import { withCreator } from '../executor/creator.js'
import type { Context, PlanningAccess, PlanningHandlerOptions } from '../types.js'
import { assertGranted, concealed, handlerScopeOf, writableIn } from '../utils/index.js'

/**
 * What a wire execution may say. `actor` is dropped — the scope names the writer — and a create's
 * `createdBy` claim is dropped too: the executor's {@link withCreator} stamps the authenticated
 * subject, the same rule an in-process create follows. Applied here as well, so the returned
 * execution already carries it. A `createdBy` in `changes` or `unset` is not dropped: the executor
 * refuses it on every action (`assertCreatorFixed`), so no body moves an owner.
 */
export const wireExecution = (body: ExecuteRequest, scope: PlanningScope): TransitionExecution => {
  const { wait: _wait, timeout: _timeout, actor: _actor, ...exec } = body
  if (exec.action === TransitionAction.Create && exec.card != null && typeof exec.card === 'object') {
    const { createdBy: _createdBy, ...draft } = exec.card
    exec.card = draft
  }
  return withCreator(exec, scope)
}

/** `wait`/`timeout` as a server grants them: the timeout never holds a request past `maxPoll`. */
export const executeOptionsOf = (body: Pick<ExecuteRequest, 'wait' | 'timeout'>, maxPoll: number): ExecuteOptions => {
  const ceiling = maxPoll * 1000
  if (body.wait !== true) {
    return {}
  }
  const asked = Number(body.timeout ?? DEFAULT_COMMIT_TIMEOUT)
  return { wait: true, timeout: Math.min(Number.isFinite(asked) && asked > 0 ? asked : DEFAULT_COMMIT_TIMEOUT, ceiling) }
}

/**
 * Refuse an execution outside the access's `writes`: the card it acts on (a specification through
 * its parent card), or every parent a create names, must be one {@link writableIn} admits. A create
 * of a project is `grants.createProjects`' alone. A card or parent this scope cannot see is left to
 * the executor, which answers it as absent.
 *
 * @throws {PlanningForbidden}
 */
export const assertExecutionWrites = async (
  facade: PlanningFacade, exec: TransitionExecution, access?: PlanningAccess
): Promise<void> => {
  if (access?.writes == null) {
    return
  }
  const admitted = async (card: Workcard): Promise<boolean> => {
    if (writableIn(access, card)) {
      return true
    }
    if (!isSpecification(card) || card.parent == null) {
      return false
    }
    const parent = await facade.cards.load(card.parent)
    return parent == null || writableIn(access, parent)
  }

  if (exec.action === TransitionAction.Create && exec.card != null && typeof exec.card === 'object') {
    if (exec.card.kind === WorkcardKind.Project) {
      return
    }
    const parents = normalizeParents(exec.card.parent, exec.card.parents)
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

/**
 * The access a wire execution needs. `writes` first ({@link assertExecutionWrites}); then the
 * grants: `createProjects` for a project create (its primary parent, or the root),
 * `deleteProjects` for the delete of a project card. A card this scope cannot see is left to the
 * executor, which answers it as absent.
 *
 * @throws {PlanningForbidden}
 */
export const assertExecutionGranted = async (
  facade: PlanningFacade, exec: TransitionExecution, access?: PlanningAccess
): Promise<void> => {
  await assertExecutionWrites(facade, exec, access)
  if (access?.grants == null) {
    return
  }
  if (exec.action === TransitionAction.Create && typeof exec.card === 'object' && exec.card?.kind === WorkcardKind.Project) {
    assertGranted(access, 'createProjects', normalizeParents(exec.card.parent, exec.card.parents)[0])
    return
  }
  if (exec.action === TransitionAction.Delete && typeof exec.card === 'string') {
    const card = await facade.cards.load(exec.card)
    if (card != null && isProject(card)) {
      assertGranted(access, 'deleteProjects', card.id)
    }
  }
}

/** The one write route. */
export const executePlanning = (
  protocol: PlanningProtocols['execute'], opts?: PlanningHandlerOptions
): ReturnType<ReturnType<typeof handlers<Context>>['request']> =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async (): Promise<TransitionReceiptView> => {
    const { facade, access } = await handlerScopeOf(ctx, req, opts)
    const body = (req.body ?? {}) as ExecuteRequest
    const exec = wireExecution(body, facade.scope)
    await assertExecutionGranted(facade, exec, access)
    const receipt = await facade.execute(exec, executeOptionsOf(body, opts?.maxPoll ?? MAX_COMMIT_POLL))

    return receipt.card !== undefined
      ? { transition: receipt.transition, card: receipt.card }
      : { transition: receipt.transition }
  }))
