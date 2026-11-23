import type { PlanningExecContext, PlanningPlugin, PlanningScope, TransitionExecution } from '@owlmeans/planning'
import type { PluginRegistry } from '../../types.js'
import type { Resolved } from '../types.js'

/** Step 8 of the write path: the code a card gets, unique within its policy's scope. */
export interface CodeUtils {
  /**
   * Step 8: the code a new card gets, or the check a changed code passes.
   *
   * A caller-supplied code is checked for uniqueness; otherwise the plugins' `mintCode` chain answers
   * (first answer wins, and is checked too); otherwise the type's policy mints one — a slug policy
   * derives it from the title. A type with no policy and no supplied code gets none.
   *
   * A `retype` keeps the code when the new type has no policy, or when the code carries the new
   * policy's prefix and is free in the new type's scope; otherwise it mints one under the new policy
   * (the plugins' chain first) and appends the old code to `fields.formerCodes`.
   *
   * @throws {CodeTaken}
   */
  assignCode: (
    exec: TransitionExecution,
    resolved: Resolved,
    scope: PlanningScope,
    registry: PluginRegistry,
    contextOf: (plugin: PlanningPlugin) => PlanningExecContext
  ) => Promise<TransitionExecution>
}
