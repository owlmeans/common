import {
  criteriaOf, currentSpecification, isSpecification, linkWhereOf, listOptionsOf, modelOf,
  PlanningUnsupported, specCriteriaOf, transitionWhereOf, WorkcardKind, WorkcardNotFound,
} from '@owlmeans/planning'
import type {
  CommitSource, PlanningFacade, PlanningScope, Specification, Workcard, WorkcardModel,
} from '@owlmeans/planning'
import { executeTransition } from './executor.js'
import type { PlanningRuntime } from './service.js'
import type { CommitHub } from './store/types.js'

/**
 * The scoped facade over the service's stores.
 *
 * Every read carries the scope's `entityId` into the store and re-checks it on what comes back, so
 * a card of another entity is simply absent — `load` answers `null`, `get` throws
 * `WorkcardNotFound`, exactly as for an id that never existed. Reads go through the composite
 * store (the default store plus the stores plugins own); writes go through the executor.
 */
export const makeStoreFacade = (runtime: PlanningRuntime, scope: PlanningScope): PlanningFacade => {
  const entityId = scope.entityId
  const reader = () => runtime.reader()
  const mine = <T extends { entityId: string }>(record: T | null | undefined): T | null =>
    record != null && record.entityId === entityId ? record : null

  const commitSource = (): CommitSource => {
    const commits = reader().commits
    if (commits == null) {
      throw new PlanningUnsupported('commits')
    }
    return commits
  }

  /** The transition is this entity's — its row, or the remembered commit of a purged one. */
  const assertTransition = async (transition: string): Promise<void> => {
    const row = await reader().transitions?.get(transition)
    if (row != null) {
      if (row.entityId !== entityId) {
        throw new WorkcardNotFound(`transition:${transition}`)
      }
      return
    }
    const recalled = (reader().commits as Partial<CommitHub> | undefined)?.recall?.(transition)
    if (recalled == null || recalled.entityId !== entityId) {
      throw new WorkcardNotFound(`transition:${transition}`)
    }
  }

  const facade: PlanningFacade = {
    scope: Object.freeze({ ...scope }),

    schemas: runtime.service().schemas,

    cards: {
      load: async id => mine(await reader().cards.get(id, entityId)),

      get: async id => {
        const card = await facade.cards.load(id)
        if (card == null) {
          throw new WorkcardNotFound(id)
        }
        return card
      },

      list: async query => await reader().cards.list(criteriaOf(query, scope), listOptionsOf(query)),

      count: async query => await reader().cards.count(criteriaOf(query, scope)),

      summary: async (parents, query) => parents.length === 0
        ? {}
        : await reader().cards.summary(parents, criteriaOf({ kind: query?.kind, type: query?.type }, scope)),
    },

    specifications: {
      current: async (parent, category) => {
        const specs = reader().specs
        if (specs != null) {
          return mine(await specs.current(parent, category, entityId))
        }
        const listed = await reader().cards.list(specCriteriaOf(parent, { category }, scope) as never, { size: 0 })
        return currentSpecification(listed.items, category)
      },

      list: async (parent, query) => {
        const specs = reader().specs
        if (specs != null) {
          return await specs.list(parent, entityId, query)
        }
        return await reader().cards.list(specCriteriaOf(parent, query, scope) as never, listOptionsOf(query) as never) as never
      },

      get: async id => {
        const card = await facade.cards.load(id)
        if (card == null || !isSpecification(card)) {
          throw new WorkcardNotFound(id)
        }
        return card as Specification
      },

      revisions: async (id, limit) => {
        await facade.specifications.get(id)
        const specs = reader().specs
        if (specs == null) {
          throw new PlanningUnsupported('revisions')
        }
        return await specs.revisions(id, entityId, limit)
      },
    },

    relationships: {
      list: async query => {
        const links = reader().links
        return links == null
          ? { items: [], total: 0 }
          : await links.list(linkWhereOf(query, scope), listOptionsOf(query))
      },
    },

    transitions: {
      get: async id => {
        const transition = mine(await reader().transitions?.get(id))
        if (transition == null) {
          throw new WorkcardNotFound(`transition:${id}`)
        }
        return transition
      },

      list: async query => {
        const transitions = reader().transitions
        return transitions == null
          ? { items: [], total: 0 }
          : await transitions.list(transitionWhereOf(query, scope), listOptionsOf(query))
      },
    },

    commits: {
      status: async transition => {
        await assertTransition(transition)
        return await commitSource().status(transition)
      },

      subscribe: (listener, filter) => commitSource().subscribe(listener, { ...filter, entityId }),

      wait: async (transition, opts) => {
        await assertTransition(transition)
        return await commitSource().wait(transition, opts)
      },
    },

    execute: async (exec, opts) => await executeTransition(runtime, facade, exec, opts),

    model: async <T extends Workcard = Workcard>(card: T | string): Promise<WorkcardModel<T>> => {
      const record = typeof card === 'string' ? await facade.cards.get(card) as T : card
      if (record.entityId !== entityId) {
        throw new WorkcardNotFound(record.id ?? WorkcardKind.Card)
      }
      return modelOf<T>(record, facade)
    },
  }

  return facade
}
