import { PlanningError, TransitionAction } from '@owlmeans/planning'
import type { PlanningScope, TransitionExecution } from '@owlmeans/planning'

const named = (value?: string | null): value is string => value != null && value !== ''

/** The field a create's draft writes once and nothing moves afterwards. */
const CREATOR = 'createdBy'

/**
 * The subject a create made under `scope` is stamped with as its `createdBy`: the scope's
 * `profileId`, else its `userId`, else the same two of its `actor` — the authenticated subject an
 * HTTP scope carries, in the same format. `undefined` for a scope that names nobody (a service or a
 * system scope).
 */
export const creatorOf = (scope: PlanningScope): string | undefined =>
  [scope.profileId, scope.userId, scope.actor?.profileId, scope.actor?.userId].find(named)

/**
 * A create's draft with `createdBy` defaulted to {@link creatorOf} the scope. A `createdBy` the
 * caller supplied wins; a scope that names nobody leaves the draft as it is; anything but a create
 * is returned untouched. Never mutates `exec`.
 *
 * The executor applies it to every execution, so an in-process facade create and a wire create
 * stamp the same value.
 */
export const withCreator = (exec: TransitionExecution, scope: PlanningScope): TransitionExecution => {
  if (exec.action !== TransitionAction.Create || exec.card == null || typeof exec.card !== 'object') {
    return exec
  }
  if (named(exec.card.createdBy)) {
    return exec
  }
  const creator = creatorOf(scope)

  return creator == null ? exec : { ...exec, card: { ...exec.card, createdBy: creator } }
}

/**
 * Refuse an execution that names `createdBy` in `changes` or `unset`, whatever the action — a
 * create included, whose owner is its draft's. After the create it never moves, so an ownership
 * check (`card.createdBy === profileId`) cannot be bypassed by anyone allowed to update the card.
 *
 * The executor runs it with the immutables of step 6, after the `before` chain, so a wire body, an
 * in-process caller and a plugin are refused alike. It is the executor's own check, whatever
 * `@owlmeans/planning` build `assertMutable` comes from.
 *
 * @throws {PlanningError} `planning:immutable:createdBy`
 */
export const assertCreatorFixed = (exec: TransitionExecution): void => {
  if ((exec.changes as Record<string, unknown> | undefined)?.[CREATOR] !== undefined
    || (exec.unset ?? []).some(path => path.split('.')[0] === CREATOR)) {
    throw new PlanningError(`immutable:${CREATOR}`)
  }
}
