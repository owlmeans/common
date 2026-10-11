import type { AnyTypeSchema, PlanningSchemaRegistry, Specification, SpecificationSlot, Workcard } from '../../types.js'

/** The slot and revision rules of the documents a parent card carries. */
export interface SpecificationHelper {
  /** The slot a parent type declares for a category. */
  slotOf: (type: AnyTypeSchema, category: string) => SpecificationSlot | undefined
  isRevisioned: (slot?: SpecificationSlot | null) => boolean
  bodyCharsOf: (body?: string | null) => number | undefined
  /** The revision a write lands as: 1 for a new document, current + 1 after, none when unrevisioned. */
  nextRevision: (current: Pick<Specification, 'revision'> | null | undefined, slot?: SpecificationSlot | null) => number | undefined
  /**
   * The current document of a category among a parent's specifications: the highest revision, then
   * the most recently updated. `null` when the category has none.
   */
  currentSpecification: (specs: Workcard[], category: string) => Specification | null
  /**
   * The specification type a new document of a slot is created with: the slot's own `type`, else
   * the only registered specification type, else the one sharing the parent type's prefix
   * (`viable:project` → `viable:spec`).
   *
   * @throws {UnknownWorkcardType} when none or several candidates remain
   */
  specificationTypeOf: (
    registry: Pick<PlanningSchemaRegistry, 'types'>, parentType: string, slot?: SpecificationSlot | null
  ) => string
}
