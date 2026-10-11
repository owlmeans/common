import type { AnyTypeSchema, PlanningSchemaRegistry, PlanningStore, SpecificationSlot, StatusFlowSchema, Workcard } from '@owlmeans/planning'

/** Everything the steps after resolution read about an execution. */
export interface Resolved {
  project?: string
  create: boolean
  /** The existing card (not a create). */
  card?: Workcard
  type: AnyTypeSchema
  flowId: string
  flow: StatusFlowSchema
  /** The primary parent, when it resolves. */
  parent?: Workcard
  /** The slot a specification belongs to. */
  slot?: SpecificationSlot
  /** The store the type is written to. */
  store: PlanningStore
  /**
   * The registry every later step reads: the service's code registry itself, or — where the store
   * holds data-defined schemas — the resolved layer of the card's project.
   */
  schemas: PlanningSchemaRegistry
}
