/** The capabilities a story contributes to a domain record. */
export type RecordCapability = 'create' | 'read' | 'update' | 'delete' | 'list' | 'action'

/** Placement is independent of story count and of whether an editor has a route. */
export interface RecordInteractionPlan {
  entity: string
  /** User-facing action label in the product's language. */
  label?: string
  /** Written by the generator, so a reworded story gets a fresh placement decision. */
  storyHash?: string
  /** Set only for a dependent record, never merely because it has a foreign key. */
  ownerEntity?: string
  capabilities: RecordCapability[]
  placement: 'destination' | 'contextual'
  presentation: 'inline' | 'dialog' | 'sheet' | 'route'
  /** The collection/detail host, including when the story contributes only an action. */
  hostScreen?: string
  /** A record detail can be a host without being a menu destination itself. */
  hostKind?: 'collection' | 'record' | 'singleton'
  /** Existing component to extend deliberately rather than by similarity. */
  hostComponent?: string
  /** Existing list/board/picker components whose record-open actions enter the shared detail. */
  selectionComponents?: string[]
  /** Identifier taken from the selected record; never the latest or first record. */
  recordKey?: string
  /** Parent identifier supplied by the open parent detail. */
  parentKey?: string
  /** Product requirement supporting an independent library or standalone primary workflow. */
  standaloneReason?: string
}

export interface RecordInteractionHelper {
  hostEntity: (plan: RecordInteractionPlan) => string
  isHostScreen: (plan: RecordInteractionPlan, screen: string) => boolean
  menuEligible: (plan: RecordInteractionPlan | undefined, screen: string) => boolean | undefined
}
