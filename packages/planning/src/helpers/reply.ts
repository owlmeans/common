import { REPLY_CONTAINERS } from './reply/consts.js'
import type { PlanningReply, PlanningReplyHelper } from './reply/types.js'

/** Project known planning envelopes; custom fields, changes and schema definitions remain opaque. */
export const createPlanningReplyHelper = (): PlanningReplyHelper => {
  const visit = (value: unknown, hydrate: boolean, scope = false): unknown => {
    if (Array.isArray(value)) return value.map(item => visit(item, hydrate))
    if (value == null || typeof value !== 'object') return value
    const source = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(source)) {
      if (key === 'entityId') continue
      result[key] = REPLY_CONTAINERS.has(key) ? visit(item, hydrate, key === 'scope') : item
    }
    const record = typeof source.createdAt === 'string'
      || (typeof source.card === 'string' && typeof source.seq === 'number'
        && (source.commit != null || typeof source.state === 'string'))
    if (hydrate && (scope || record)) result.entityId = ''
    return result
  }
  return {
    project: <T>(value: T): PlanningReply<T> => visit(value, false) as PlanningReply<T>,
    hydrate: <T>(value: PlanningReply<T>): T => visit(value, true) as T,
  }
}

export const planningReplyHelper = createPlanningReplyHelper()
