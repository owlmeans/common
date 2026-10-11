import type { PlanningCommitRecord, PlanningStores } from '../types.js'
import type { CommitState, Relationship, Workcard } from '@owlmeans/planning'
import type { ResourceRecord } from '@owlmeans/resource'
import type { StateResource } from '@owlmeans/state'
import type { RecordUtils } from './record/types.js'

export const createRecordUtils = (): RecordUtils => {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(stable)
    }
    if (value != null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, stable(entry)]))
    }

    return value
  }

  const sameRecord = (left: unknown, right: unknown): boolean =>
    JSON.stringify(stable(left)) === JSON.stringify(stable(right))

  const putCard = async (store: StateResource<Workcard>, card: Workcard): Promise<Workcard> => {
    if (card.id == null) {
      return card
    }
    const known = await store.load(card.id)
    if (known != null && (known.seq ?? 0) > (card.seq ?? 0)) {
      return known
    }
    const head = Math.max(card.head ?? card.seq ?? 0, known?.head ?? 0)
    const next = head > (card.head ?? card.seq ?? 0) ? { ...card, head } : card
    if (known != null && sameRecord(known, next)) {
      return known
    }
    await store.save(next)

    return next
  }

  const putLink = async (store: StateResource<Relationship>, link: Relationship): Promise<void> => {
    if (link.id == null) {
      return
    }
    const known = await store.load(link.id)
    if (known != null && sameRecord(known, link)) {
      return
    }
    await store.save(link)
  }

  const dropCard = async (stores: PlanningStores, id: string, project: boolean): Promise<void> => {
    const ids = [id]
    if (project) {
      const children = await stores.cards.list({ parents: { $contains: [id] } })
      ids.push(...children.items.map(child => child.id).filter((child): child is string => child != null))
    }
    await stores.cards.purge({ id: { $in: ids } })
    if (await stores.links.count({ $or: [{ from: { $in: ids } }, { to: { $in: ids } }] }) > 0) {
      await stores.links.purge({ $or: [{ from: { $in: ids } }, { to: { $in: ids } }] })
    }
  }

  const putCommit = async (
    store: StateResource<PlanningCommitRecord>, record: Partial<PlanningCommitRecord> & { id: string, state: CommitState }
  ): Promise<PlanningCommitRecord> => {
    const known = await store.load(record.id)
    const next = { ...known, ...clean(record) } as PlanningCommitRecord
    if (known != null && sameRecord(known, next)) {
      return known
    }
    await store.save(next)

    return next
  }

  const clean = <T extends object>(record: T): T =>
    Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

  const idsOf = <T extends ResourceRecord>(records: T[]): string[] =>
    records.map(record => record.id).filter((id): id is string => id != null)

  return { sameRecord, putCard, putLink, dropCard, putCommit, clean, idsOf }
}

export const recordUtils = createRecordUtils()
