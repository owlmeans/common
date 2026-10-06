import type { PlanningScope, TransitionExecution } from '@owlmeans/planning'

/** Who owns a card: `createdBy`, stamped from the scope on a create and fixed after it. */
export interface CreatorHelper {
  /**
   * The subject a create made under `scope` is stamped with as its `createdBy`: the scope's
   * `profileId`, else its `userId`, else the same two of its `actor` — the authenticated subject an
   * HTTP scope carries, in the same format. `undefined` for a scope that names nobody (a service or a
   * system scope).
   */
  creatorOf: (scope: PlanningScope) => string | undefined
  /**
   * A create's draft with `createdBy` defaulted to {@link CreatorHelper.creatorOf} the scope. A
   * `createdBy` the caller supplied wins; a scope that names nobody leaves the draft as it is;
   * anything but a create is returned untouched. Never mutates `exec`.
   *
   * The executor applies it to every execution, so an in-process facade create and a wire create
   * stamp the same value.
   */
  withCreator: (exec: TransitionExecution, scope: PlanningScope) => TransitionExecution
  /**
   * Refuse an execution that names `createdBy` in `changes` or `unset`, whatever the action — a
   * create included, whose owner is its draft's. After the create it never moves, so an ownership
   * check (`card.createdBy === profileId`) cannot be bypassed by anyone allowed to update the card.
   *
   * The executor runs it with the immutables of step 6, after the `before` chain, so a wire body, an
   * in-process caller and a plugin are refused alike. It is the executor's own check, whatever
   * `@owlmeans/planning` build `changesHelper.assertMutable` comes from.
   *
   * @throws {PlanningError} `planning:immutable:createdBy`
   */
  assertCreatorFixed: (exec: TransitionExecution) => void
}
