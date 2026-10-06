import type { PlanningFacade, PlanningService, PlanningStore } from '@owlmeans/planning'

/** What a case runs against: a planning service over the store under test. */
export interface ConformanceSubject {
  /** A service with `planningConformancePlugin` registered and a strictly increasing clock. */
  service: PlanningService
  /** The store under test — the service's default store. */
  store: PlanningStore
  /** A facade of one organization, acting as a signed-in person. */
  facade: (entityId: string) => PlanningFacade
}

/** A capability a store may implement; a case that needs one is skipped for a store without it. */
export type ConformanceCapability = 'schemas'

export interface ConformanceCase {
  name: string
  needs?: ConformanceCapability[]
  run: (subject: ConformanceSubject) => Promise<void>
}
