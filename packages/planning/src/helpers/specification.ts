import { WorkcardKind } from '../consts.js'
import { UnknownWorkcardType } from '../errors.js'
import type {
  AnyTypeSchema, PlanningSchemaRegistry, Specification, SpecificationSlot, Workcard,
} from '../types.js'

/** The slot a parent type declares for a category. */
export const slotOf = (type: AnyTypeSchema, category: string): SpecificationSlot | undefined =>
  type.specifications.find(slot => slot.category === category)

export const isRevisioned = (slot?: SpecificationSlot | null): boolean => slot?.revisioned === true

export const bodyCharsOf = (body?: string | null): number | undefined => body == null ? undefined : body.length

/** The revision a write lands as: 1 for a new document, current + 1 after, none when unrevisioned. */
export const nextRevision = (
  current: Pick<Specification, 'revision'> | null | undefined, slot?: SpecificationSlot | null
): number | undefined => isRevisioned(slot) ? (current?.revision ?? 0) + 1 : undefined

/**
 * The current document of a category among a parent's specifications: the highest revision, then
 * the most recently updated. `null` when the category has none.
 */
export const currentSpecification = (
  specs: Workcard[], category: string
): Specification | null => specs
  .filter((spec): spec is Specification => spec.kind === WorkcardKind.Specification
    && (spec as Specification).category === category)
  .reduce<Specification | null>((best, spec) => {
    if (best == null) {
      return spec
    }
    const byRevision = (spec.revision ?? 0) - (best.revision ?? 0)
    if (byRevision !== 0) {
      return byRevision > 0 ? spec : best
    }
    return (spec.updatedAt ?? spec.createdAt) > (best.updatedAt ?? best.createdAt) ? spec : best
  }, null)

const prefixOf = (type: string): string => type.includes(':') ? type.slice(0, type.lastIndexOf(':')) : ''

/**
 * The specification type a new document of a slot is created with: the slot's own `type`, else
 * the only registered specification type, else the one sharing the parent type's prefix
 * (`viable:project` → `viable:spec`).
 *
 * @throws {UnknownWorkcardType} when none or several candidates remain
 */
export const specificationTypeOf = (
  registry: Pick<PlanningSchemaRegistry, 'types'>, parentType: string, slot?: SpecificationSlot | null
): string => {
  if (slot?.type != null) {
    return slot.type
  }
  const candidates = registry.types().filter(type => type.kind === WorkcardKind.Specification)
  if (candidates.length === 1) {
    return candidates[0].type
  }
  const prefixed = candidates.filter(type => prefixOf(type.type) === prefixOf(parentType))
  if (prefixed.length === 1) {
    return prefixed[0].type
  }

  throw new UnknownWorkcardType(`specification:${parentType}:${slot?.category ?? ''}`)
}
