import { IntrinsicStatus, TransitionAction } from '../consts.js'
import { PlanningError } from '../errors.js'
import type { Relationship, RelationshipDraft, Transition, Workcard } from '../types.js'
import type { ApplyHelper } from './apply/types.js'
import { IDENTITY_KEYS, MERGED_KEYS, REQUIRED_KEYS } from './apply/consts.local.js'

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

export const createApplyHelper = (): ApplyHelper => {
  const outOfOrder = (card: Workcard | null | undefined, transition: Transition): PlanningError =>
    new PlanningError(`fold:out-of-order:${transition.card}:${card?.seq ?? 0}:${transition.seq}`)

  const unsetOn = (record: Record<string, unknown>, paths: string[] | undefined): void => {
    for (const path of paths ?? []) {
      const dot = path.indexOf('.')
      if (dot > 0) {
        const head = path.slice(0, dot)
        const map = record[head]
        if (MERGED_KEYS.has(head) && map != null && typeof map === 'object') {
          delete (map as Record<string, unknown>)[path.slice(dot + 1)]
        }
        continue
      }
      if (!REQUIRED_KEYS.has(path)) {
        delete record[path]
      }
    }
  }

  const writeChanges = (record: Record<string, unknown>, changes: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || IDENTITY_KEYS.has(key)) {
        continue
      }
      if (MERGED_KEYS.has(key)) {
        const merged = { ...(record[key] as Record<string, unknown> | undefined ?? {}) }
        for (const [entry, entryValue] of Object.entries(value as Record<string, unknown> ?? {})) {
          if (entryValue === null) {
            delete merged[entry]
          } else if (entryValue !== undefined) {
            merged[entry] = entryValue
          }
        }
        record[key] = merged
        continue
      }
      if (value === null) {
        if (!REQUIRED_KEYS.has(key)) {
          delete record[key]
        }
        continue
      }
      record[key] = value
    }
  }

  const applyTransition = <T extends Workcard = Workcard>(
    card: T | null | undefined, transition: Transition
  ): T | null => {
    if (card != null && transition.seq <= card.seq) {
      return card
    }
    if (card == null) {
      if (transition.action === TransitionAction.Delete) {
        return null
      }
      if (transition.action !== TransitionAction.Create || transition.seq !== 1) {
        throw outOfOrder(card, transition)
      }
    } else if (transition.seq !== card.seq + 1) {
      throw outOfOrder(card, transition)
    }

    if (transition.action === TransitionAction.Delete) {
      return null
    }

    const head = Math.max(card?.head ?? card?.seq ?? 0, transition.seq)
    const changes = structuredClone(transition.changes ?? {}) as Record<string, unknown>

    if (transition.action === TransitionAction.Create) {
      const record: Record<string, unknown> = {
        parents: [], labels: [], fields: {}, flows: {}, status: '', intrinsic: IntrinsicStatus.Planned,
      }
      writeChanges(record, changes)
      unsetOn(record, transition.unset)

      return clean({
        ...record,
        id: transition.card,
        kind: transition.kind,
        type: transition.type,
        entityId: transition.entityId,
        seq: transition.seq,
        head,
        createdAt: transition.at,
        updatedAt: transition.at,
      }) as unknown as T
    }

    const record = structuredClone(card) as unknown as Record<string, unknown>
    if (transition.action === TransitionAction.Update || transition.action === TransitionAction.Transit) {
      writeChanges(record, changes)
      unsetOn(record, transition.unset)
    }
    record.seq = transition.seq
    record.head = head
    record.updatedAt = transition.at

    return clean(record) as unknown as T
  }

  const edgeOf = (transition: Transition, draft: RelationshipDraft): Relationship => clean({
    entityId: transition.entityId,
    type: draft.type,
    from: draft.from ?? transition.card,
    to: draft.to,
    project: transition.project,
    fields: draft.fields == null ? undefined : structuredClone(draft.fields),
    createdAt: transition.at,
    transition: transition.id,
  })

  const sameEdge = (left: Pick<Relationship, 'entityId' | 'from' | 'to' | 'type'>, right: Pick<Relationship, 'entityId' | 'from' | 'to' | 'type'>): boolean =>
    left.entityId === right.entityId && left.from === right.from && left.to === right.to && left.type === right.type

  const applyRelationship = (links: Relationship[], transition: Transition): Relationship[] => {
    const add = (drafts: RelationshipDraft[]): Relationship[] => drafts.reduce((result, draft) => {
      const edge = edgeOf(transition, draft)
      return result.some(existing => sameEdge(existing, edge)) ? result : [...result, edge]
    }, [...links])

    switch (transition.action) {
      case TransitionAction.Create:
        return add(transition.links ?? [])
      case TransitionAction.Link:
        return add(transition.link == null ? [] : [transition.link])
      case TransitionAction.Unlink: {
        if (transition.link == null) {
          return [...links]
        }
        const edge = edgeOf(transition, transition.link)
        return links.filter(existing => !sameEdge(existing, edge))
      }
      case TransitionAction.Delete:
        return links.filter(existing => existing.entityId !== transition.entityId
          || (existing.from !== transition.card && existing.to !== transition.card))
      default:
        return [...links]
    }
  }

  return { applyTransition, applyRelationship }
}

export const applyHelper = createApplyHelper()

/** @deprecated compat:factory-refactor — use `applyHelper.applyTransition(…)` */
export const applyTransition = <T extends Workcard = Workcard>(
  card: T | null | undefined, transition: Transition
): T | null => applyHelper.applyTransition<T>(card, transition)

/** @deprecated compat:factory-refactor — use `applyHelper.applyRelationship(…)` */
export const applyRelationship = (links: Relationship[], transition: Transition): Relationship[] =>
  applyHelper.applyRelationship(links, transition)
