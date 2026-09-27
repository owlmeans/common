import { WorkcardNotFound } from '@owlmeans/planning'
import type {
  CommitSource, PlanningStore, ProjectionStore, Relationship, RelationshipStore, SpecificationStore,
  TransitionStore, Unsubscribe, Workcard,
} from '@owlmeans/planning'
import { applyQuery } from '@owlmeans/resource'
import type { Criteria, ListResult } from '@owlmeans/resource'
import type { CommitHub, StoreRoute } from './types.js'

const firstOf = async <S, T>(
  stores: S[], read: (store: S) => Promise<T | null | undefined> | undefined
): Promise<T | null> => {
  for (const store of stores) {
    const found = await read(store)
    if (found != null) {
      return found
    }
  }
  return null
}

const sum = async <S>(stores: S[], run: (store: S) => Promise<number>): Promise<number> =>
  (await Promise.all(stores.map(run))).reduce((total, count) => total + count, 0)

/**
 * One `PlanningStore` over a default store and the stores plugins OWN.
 *
 * Writes that name a type go to the owning store; a read by id asks the default store first and
 * then each owner; a list whose criteria names one owned type (or several owned by one store) goes
 * there, and every other list is the default store's — a cross-type query is answered by the
 * default store alone, never merged. Relationship lists and commit subscriptions span every store.
 */
export const makeCompositeStore = (routes: StoreRoute[], fallback: PlanningStore): PlanningStore => {
  const all = [...new Set([fallback, ...routes.map(route => route.store)])]
  if (all.length === 1) {
    return fallback
  }

  const byType = (type?: string): PlanningStore =>
    type == null ? fallback : routes.find(route => route.owns(type))?.store ?? fallback

  const byCriteria = (where?: Criteria<Workcard>): PlanningStore => {
    const type = (where as Record<string, unknown> | undefined)?.type
    if (typeof type === 'string') {
      return byType(type)
    }
    if (Array.isArray(type) && type.length > 0) {
      const targets = new Set(type.map(entry => byType(`${entry}`)))
      return targets.size === 1 ? [...targets][0] : fallback
    }
    return fallback
  }

  const logged = all.filter(store => store.transitions != null)
  const byCard = async (card: string): Promise<PlanningStore> => {
    for (const store of logged) {
      if (await store.transitions!.head(card) > 0) {
        return store
      }
    }
    return fallback
  }

  const cards: ProjectionStore = {
    get: (id, entityId) => firstOf(all, store => store.cards.get(id, entityId)),
    list: (where, opts) => byCriteria(where).cards.list(where, opts),
    count: where => byCriteria(where).cards.count(where),
    summary: (parents, where) => byCriteria(where).cards.summary(parents, where),
    put: card => byType(card.type).cards.put(card),
    drop: async (id, entityId) => { await Promise.all(all.map(store => store.cards.drop(id, entityId))) },
    project: async (card, hint) => { await (await byCard(card)).cards.project(card, hint) },
    purge: (project, entityId) => sum(all, store => store.cards.purge(project, entityId)),
  }

  const transitions: TransitionStore | undefined = logged.length === 0 ? undefined : {
    append: transition => (byType(transition.type).transitions ?? fallback.transitions!).append(transition),
    get: id => firstOf(logged, store => store.transitions!.get(id)),
    byKey: (entityId, key) => firstOf(logged, store => store.transitions!.byKey(entityId, key)),
    list: async (where, opts) => {
      const store = typeof where.card === 'string' ? await byCard(where.card) : fallback
      return await (store.transitions ?? logged[0].transitions!).list(where, opts)
    },
    nextSeq: async (card, expect) => (await byCard(card)).transitions!.nextSeq(card, expect),
    head: async card => (await byCard(card)).transitions?.head(card) ?? 0,
    commit: async (id, commit) => {
      for (const store of logged) {
        if (await store.transitions!.get(id) != null) {
          await store.transitions!.commit(id, commit)
          return
        }
      }
    },
    purge: where => sum(logged, store => store.transitions!.purge(where)),
  }

  const specified = all.filter(store => store.specs != null)
  const specs: SpecificationStore | undefined = specified.length === 0 ? undefined : {
    current: (parent, category, entityId) => firstOf(specified, store => store.specs!.current(parent, category, entityId)),
    list: async (parent, entityId, query) => {
      for (const store of specified) {
        const result = await store.specs!.list(parent, entityId, query)
        if (result.total > 0) {
          return result
        }
      }
      return { items: [], total: 0 }
    },
    revisions: async (id, entityId, limit) => {
      for (const store of specified) {
        const result = await store.specs!.revisions(id, entityId, limit)
        if (result.length > 0) {
          return result
        }
      }
      return []
    },
  }

  const linked = all.filter(store => store.links != null)
  const links: RelationshipStore | undefined = linked.length === 0 ? undefined : {
    list: async (where, opts) => {
      const results = await Promise.all(linked.map(store => store.links!.list(where, { size: 0 })))
      const items = results.flatMap((result: ListResult<Relationship>) => result.items)
      return applyQuery(items, undefined, opts)
    },
    put: link => (fallback.links ?? linked[0].links!).put(link),
    drop: where => sum(linked, store => store.links!.drop(where)),
  }

  const committing = all.filter(store => store.commits != null)
  const statusStore = async (transition: string): Promise<CommitSource> => {
    for (const store of committing) {
      try {
        await store.commits!.status(transition)
        return store.commits!
      } catch {
        // not this store's transition
      }
    }
    throw new WorkcardNotFound(`transition:${transition}`)
  }

  const commits: (CommitSource & Pick<CommitHub, 'recall'>) | undefined = committing.length === 0 ? undefined : {
    status: async transition => await (await statusStore(transition)).status(transition),
    wait: async (transition, opts) => await (await statusStore(transition)).wait(transition, opts),
    subscribe: async (listener, filter) => {
      const releases = await Promise.all(committing.map(store => store.commits!.subscribe(listener, filter)))
      const unsubscribe: Unsubscribe = () => releases.forEach(release => release())
      return unsubscribe
    },
    recall: transition => {
      for (const store of committing) {
        const event = (store.commits as Partial<CommitHub>).recall?.(transition)
        if (event != null) {
          return event
        }
      }
      return undefined
    },
  }

  return {
    alias: `composite:${fallback.alias ?? 'default'}`,
    newId: fallback.newId,
    cards,
    ...(transitions != null ? { transitions } : {}),
    ...(specs != null ? { specs } : {}),
    ...(links != null ? { links } : {}),
    ...(commits != null ? { commits } : {}),
  }
}
