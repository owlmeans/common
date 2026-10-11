import type {
  ChangeSet, PlanningSchemaRegistry, PlanningScope, Transition, TransitionActor, TransitionExecution,
} from '@owlmeans/planning'
import type { Resolved } from '../types.js'

/** What step 11 builds the appended transition from. */
export interface AppendParams {
  exec: TransitionExecution
  resolved: Resolved
  scope: PlanningScope
  set: ChangeSet
  cardId: string
  seq: number
  project?: string
  at: string
}

/** The record an execution appends: its changes, its actor and the transition itself. */
export interface ChangesUtils {
  /**
   * Step 9: the recorded `changes`/`unset`, and whether an update wrote nothing.
   *
   * @throws {IllegalTransition | PlanningError}
   */
  changeSetOf: (
    exec: TransitionExecution, resolved: Resolved, schemas: PlanningSchemaRegistry, at: string
  ) => { set: ChangeSet, empty: boolean }
  /**
   * Who wrote it — the SCOPE's identity, never the execution's.
   *
   * `profileId`, `userId`, `service` and `channel` come only from the scope (the server builds it
   * from the authenticated request); the descriptive `agent`/`runId` an in-process caller passes on
   * the execution are kept unless the scope's own actor names them.
   */
  actorOf: (scope: PlanningScope, exec: TransitionExecution) => TransitionActor
  /** Step 11's record: the event as it is appended, `pending`. */
  transitionOf: (params: AppendParams) => Transition
}
