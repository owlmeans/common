import { PlanningForbidden, type Workcard } from '@owlmeans/planning'
import type { PlanningAccess, PlanningAccessGrants } from '../types.js'
import type { PlanningAccessModel } from './access/types.js'

export const makePlanningAccessModel = (access: PlanningAccess | undefined): PlanningAccessModel => {
  const assertGranted = (grant: keyof PlanningAccessGrants, target?: string): void => {
    if (access?.grants == null) {
      return
    }
    const granted = access.grants[grant]
    if (granted === true || (Array.isArray(granted) && target != null && granted.includes(target))) {
      return
    }
    throw new PlanningForbidden(`${grant}:${target ?? 'root'}`)
  }

  const writableIn = (card: Pick<Workcard, 'id' | 'parents'>): boolean => {
    const writes = access?.writes
    if (writes == null) {
      return true
    }
    return (card.id != null && writes.includes(card.id)) || card.parents.some(parent => writes.includes(parent))
  }

  const assertWrites = (target?: string): void => {
    if (access?.writes == null || (target != null && access.writes.includes(target))) {
      return
    }
    throw new PlanningForbidden(`writes:${target ?? 'root'}`)
  }

  return { record: access, assertGranted, writableIn, assertWrites }
}
