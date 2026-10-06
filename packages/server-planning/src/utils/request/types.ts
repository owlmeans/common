import type { PlanningScope, TransitionActor } from '@owlmeans/planning'
import type { PlanningAccess } from '../../types.js'

/** One request's identity as planning reads it — built at the top of a handler, never stored. */
export interface RequestScope {
  /** The authenticated subject of a request, as a transition names it. */
  actorOf: () => TransitionActor
  /**
   * The scope a request reads and writes as.
   *
   * `entityId` is `requireEntityKey(req)` — the resolved organization id, never a value from the
   * body or the query — and `extra` cannot replace it; `extra` adds what the deployment derives
   * (a `channel`, a `service`). The actor is the authenticated subject plus that channel.
   *
   * @throws {AuthorizationError} when the request carries no organization
   */
  scopeOf: (extra?: Partial<PlanningScope>) => PlanningScope
  /**
   * The scope of a request under a resolved {@link PlanningAccess}: the organization is the
   * resolver's — never the token's, never `extra`'s — and `projects` narrows it.
   */
  accessScopeOf: (access: PlanningAccess, extra?: Partial<PlanningScope>) => PlanningScope
}
