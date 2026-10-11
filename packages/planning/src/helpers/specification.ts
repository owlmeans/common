import { WorkcardKind } from '../consts.js'
import { UnknownWorkcardType } from '../errors.js'
import type {
  AnyTypeSchema, PlanningSchemaRegistry, Specification, SpecificationSlot, Workcard,
} from '../types.js'
import type { SpecificationHelper } from './specification/types.js'

export const createSpecificationHelper = (): SpecificationHelper => {
  const slotOf = (type: AnyTypeSchema, category: string): SpecificationSlot | undefined =>
    type.specifications.find(slot => slot.category === category)

  const isRevisioned = (slot?: SpecificationSlot | null): boolean => slot?.revisioned === true

  const bodyCharsOf = (body?: string | null): number | undefined => body == null ? undefined : body.length

  const nextRevision = (
    current: Pick<Specification, 'revision'> | null | undefined, slot?: SpecificationSlot | null
  ): number | undefined => isRevisioned(slot) ? (current?.revision ?? 0) + 1 : undefined

  const currentSpecification = (
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

  const specificationTypeOf = (
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

  return { slotOf, isRevisioned, bodyCharsOf, nextRevision, currentSpecification, specificationTypeOf }
}

export const specificationHelper = createSpecificationHelper()

/** @deprecated compat:factory-refactor — use `specificationHelper.slotOf(…)` */
export const slotOf = (type: AnyTypeSchema, category: string): SpecificationSlot | undefined =>
  specificationHelper.slotOf(type, category)

/** @deprecated compat:factory-refactor — use `specificationHelper.isRevisioned(…)` */
export const isRevisioned = (slot?: SpecificationSlot | null): boolean => specificationHelper.isRevisioned(slot)

/** @deprecated compat:factory-refactor — use `specificationHelper.bodyCharsOf(…)` */
export const bodyCharsOf = (body?: string | null): number | undefined => specificationHelper.bodyCharsOf(body)

/** @deprecated compat:factory-refactor — use `specificationHelper.nextRevision(…)` */
export const nextRevision = (
  current: Pick<Specification, 'revision'> | null | undefined, slot?: SpecificationSlot | null
): number | undefined => specificationHelper.nextRevision(current, slot)

/** @deprecated compat:factory-refactor — use `specificationHelper.currentSpecification(…)` */
export const currentSpecification = (specs: Workcard[], category: string): Specification | null =>
  specificationHelper.currentSpecification(specs, category)

/** @deprecated compat:factory-refactor — use `specificationHelper.specificationTypeOf(…)` */
export const specificationTypeOf = (
  registry: Pick<PlanningSchemaRegistry, 'types'>, parentType: string, slot?: SpecificationSlot | null
): string => specificationHelper.specificationTypeOf(registry, parentType, slot)
