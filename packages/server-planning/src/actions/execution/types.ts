import type { ExecuteOptions, ExecuteRequest, PlanningFacade, PlanningScope, TransitionExecution } from '@owlmeans/planning'
import type { PlanningAccess } from '../../types.js'

/** What a wire execution may say, how long it may hold, and what access it needs. */
export interface ExecutionHelper {
  /**
   * What a wire execution may say. `actor` is dropped — the scope names the writer — and a create's
   * `createdBy` claim is dropped too: the executor's `creatorHelper.withCreator` stamps the
   * authenticated subject, the same rule an in-process create follows. Applied here as well, so the
   * returned execution already carries it. A `createdBy` in `changes` or `unset` is not dropped: the
   * executor refuses it on every action (`assertCreatorFixed`), so no body moves an owner.
   */
  wireExecution: (body: ExecuteRequest, scope: PlanningScope) => TransitionExecution
  /** `wait`/`timeout` as a server grants them: the timeout never holds a request past `maxPoll`. */
  executeOptionsOf: (body: Pick<ExecuteRequest, 'wait' | 'timeout'>, maxPoll: number) => ExecuteOptions
  /**
   * Refuse an execution outside the access's `writes`: the card it acts on (a specification through
   * its parent card), or every parent a create names, must be one `writableIn` admits. A create
   * of a project is `grants.createProjects`' alone. A card or parent this scope cannot see is left to
   * the executor, which answers it as absent.
   *
   * @throws {PlanningForbidden}
   */
  assertExecutionWrites: (facade: PlanningFacade, exec: TransitionExecution, access?: PlanningAccess) => Promise<void>
  /**
   * The access a wire execution needs. `writes` first ({@link ExecutionHelper.assertExecutionWrites});
   * then the grants: `createProjects` for a project create (its primary parent, or the root),
   * `deleteProjects` for the delete of a project card. A card this scope cannot see is left to the
   * executor, which answers it as absent.
   *
   * @throws {PlanningForbidden}
   */
  assertExecutionGranted: (facade: PlanningFacade, exec: TransitionExecution, access?: PlanningAccess) => Promise<void>
}
