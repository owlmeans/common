import { IntrinsicStatus, TransitionAction } from '../consts.js'
import { PlanningError } from '../errors.js'
import type { Relationship, RelationshipDraft, Transition, Workcard } from '../types.js'

/** Never written by a transition's `changes`: the fold takes them from the transition itself. */
const IDENTITY_KEYS = new Set(['id', 'kind', 'type', 'entityId', 'seq', 'head', 'createdAt'])

/** Cannot be cleared: a record without them is not a record. */
const REQUIRED_KEYS = new Set([
  ...IDENTITY_KEYS, 'title', 'parents', 'status', 'intrinsic', 'flows', 'labels', 'fields',
])

/** Merged shallowly into the card's own map rather than replacing it. */
const MERGED_KEYS = new Set(['fields', 'flows'])

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

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

/**
 * THE fold: the card after one transition. Pure, total, no I/O — every store (memory, Mongo, a
 * client mirror) folds with this and nothing else, so one log always means one card.
 *
 * - An already-applied transition (`seq <= card.seq`) returns the card unchanged: re-folding is
 *   safe.
 * - Anything but the next seq (`card.seq + 1`, or 1 for a create with no card) is refused with
 *   `PlanningError('fold:out-of-order')`.
 * - `create` builds the whole record from `changes` plus the transition's identity; `delete`
 *   answers `null`; `link`/`unlink` only move `seq`/`head`/`updatedAt` (the edges are
 *   {@link applyRelationship}'s); `update`/`transit` write `changes` — `fields` and `flows` merge,
 *   everything else replaces — and clear `unset`.
 * - Every result has `seq = transition.seq`, `head = max(head, seq)`, `updatedAt = transition.at`.
 *
 * @throws {PlanningError} `planning:fold:out-of-order:…`
 */
export const applyTransition = <T extends Workcard = Workcard>(
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

/**
 * The relationships after one transition. Pure and total, like {@link applyTransition}.
 *
 * `create` adds its `links`, `link` adds its `link`, `unlink` removes the matching edge, and a
 * `delete` removes every edge touching the card. An edge that already exists is kept as it is, so
 * re-folding adds nothing. Every other action answers the list unchanged. Always a new array.
 */
export const applyRelationship = (links: Relationship[], transition: Transition): Relationship[] => {
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
