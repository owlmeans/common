import {
  criteriaOf, currentSpecification, isProject, isSpecification, linkWhereOf, listOptionsOf, modelOf, projectOf,
  PlanningUnsupported, specCriteriaOf, transitionWhereOf, WorkcardKind, WorkcardNotFound,
} from '@owlmeans/planning'
import type {
  CommitEvent, CommitSource, PlanningFacade, PlanningScope, Relationship, Specification, Transition,
  Workcard, WorkcardModel,
} from '@owlmeans/planning'
import type { Criteria } from '@owlmeans/resource'
import { makeDefinitions } from './definitions.js'
import { executeTransition } from './executor.js'
import type { PlanningRuntime } from './service.js'
import type { CommitHub } from './store/types.js'

/**
 * The criteria a scope narrowed to `projects` adds to every card read: the projects themselves and
 * every card whose `parents` name one of them.
 */
export const projectCriteriaOf = (projects: readonly string[]): Criteria<Workcard> => ({
  $or: [{ id: { $in: [...projects] } }, { parents: { $overlaps: [...projects] } }],
}) as Criteria<Workcard>

/**
 * The scoped facade over the service's stores.
 *
 * Every read carries the scope's `entityId` into the store and re-checks it on what comes back, so
 * a card of another entity is simply absent — `load` answers `null`, `get` throws
 * `WorkcardNotFound`, exactly as for an id that never existed. Reads go through the composite
 * store (the default store plus the stores plugins own); writes go through the executor.
 *
 * A scope naming `projects` sees those projects and the cards whose `parents` name one of them (a
 * card's specification through its card); everything else reads as absent, lists are narrowed by
 * an AND'd criteria, and commit events and transitions outside the set are dropped or refused.
 *
 * `definitions` is present when the default store holds data-defined schemas; a model is then
 * built over the registry of the card's own project.
 */
export const makeStoreFacade = (runtime: PlanningRuntime, scope: PlanningScope): PlanningFacade => {
  const entityId = scope.entityId
  const projects = scope.projects != null ? [...new Set(scope.projects)] : undefined
  const reader = () => runtime.reader()
  const mine = <T extends { entityId: string }>(record: T | null | undefined): T | null =>
    record != null && record.entityId === entityId ? record : null

  const inProjects = (card: Workcard): boolean => projects == null
    || (card.id != null && projects.includes(card.id))
    || card.parents.some(parent => projects.includes(parent))

  /** A card this scope may see — a specification through its parent card. */
  const visible = async (card: Workcard | null): Promise<Workcard | null> => {
    if (card == null || inProjects(card)) {
      return card
    }
    if (isSpecification(card) && card.parent != null) {
      const parent = mine(await reader().cards.get(card.parent, entityId))
      return parent != null && inProjects(parent) ? card : null
    }
    return null
  }

  const narrow = (where: Criteria<Workcard>): Criteria<Workcard> => projects == null
    ? where
    : { ...where, $and: [...((where as { $and?: Criteria<Workcard>[] }).$and ?? []), projectCriteriaOf(projects)] } as Criteria<Workcard>

  const projectVisible = (project?: string | null): boolean =>
    projects == null || (project != null && projects.includes(project))

  const commitSource = (): CommitSource => {
    const commits = reader().commits
    if (commits == null) {
      throw new PlanningUnsupported('commits')
    }
    return commits
  }

  /** The transition is this entity's (and this scope's) — its row, or the remembered commit of a purged one. */
  const assertTransition = async (transition: string): Promise<void> => {
    const row = await reader().transitions?.get(transition)
    if (row != null) {
      if (row.entityId !== entityId || !projectVisible(row.project)) {
        throw new WorkcardNotFound(`transition:${transition}`)
      }
      return
    }
    const recalled = (reader().commits as Partial<CommitHub> | undefined)?.recall?.(transition)
    if (recalled == null || recalled.entityId !== entityId || !projectVisible(recalled.project)) {
      throw new WorkcardNotFound(`transition:${transition}`)
    }
  }

  /** The project a card resolves its data-defined types in. */
  const projectFor = async (card: Workcard): Promise<string | undefined> => {
    if (isProject(card) || card.parent == null) {
      return projectOf(card)
    }
    const parent = mine(await reader().cards.get(card.parent, entityId))
    return projectOf(card, parent)
  }

  const facade: PlanningFacade = {
    scope: Object.freeze({ ...scope, ...(projects != null ? { projects } : {}) }),

    schemas: runtime.service().schemas,

    cards: {
      load: async id => await visible(mine(await reader().cards.get(id, entityId))),

      get: async id => {
        const card = await facade.cards.load(id)
        if (card == null) {
          throw new WorkcardNotFound(id)
        }
        return card
      },

      list: async query => await reader().cards.list(narrow(criteriaOf(query, scope)), listOptionsOf(query)),

      count: async query => await reader().cards.count(narrow(criteriaOf(query, scope))),

      summary: async (parents, query) => parents.length === 0
        ? {}
        : await reader().cards.summary(parents, narrow(criteriaOf({ kind: query?.kind, type: query?.type }, scope))),
    },

    specifications: {
      current: async (parent, category) => {
        if (projects != null && await facade.cards.load(parent) == null) {
          return null
        }
        const specs = reader().specs
        if (specs != null) {
          return mine(await specs.current(parent, category, entityId))
        }
        const listed = await reader().cards.list(specCriteriaOf(parent, { category }, scope) as never, { size: 0 })
        return currentSpecification(listed.items, category)
      },

      list: async (parent, query) => {
        if (projects != null && await facade.cards.load(parent) == null) {
          return { items: [], total: 0 }
        }
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
        if (links == null) {
          return { items: [], total: 0 }
        }
        if (projects == null) {
          return await links.list(linkWhereOf(query, scope), listOptionsOf(query))
        }
        const listed = await links.list({ ...linkWhereOf(query, scope), project: projects }, listOptionsOf(query))
        // A store that ignores `project` must still not leak an edge filed under another project.
        const items = listed.items.filter((link: Relationship) => projectVisible(link.project))
        return items.length === listed.items.length ? listed : { ...listed, items, total: listed.total - (listed.items.length - items.length) }
      },
    },

    transitions: {
      get: async id => {
        const transition = mine(await reader().transitions?.get(id))
        if (transition == null || !projectVisible(transition.project)) {
          throw new WorkcardNotFound(`transition:${id}`)
        }
        return transition
      },

      list: async query => {
        const transitions = reader().transitions
        if (transitions == null) {
          return { items: [], total: 0 }
        }
        if (projects == null) {
          return await transitions.list(transitionWhereOf(query, scope), listOptionsOf(query))
        }
        if (query.project != null && !projects.includes(query.project)) {
          return { items: [], total: 0 }
        }
        const listed = await transitions.list(
          { ...transitionWhereOf(query, scope), project: query.project ?? projects }, listOptionsOf(query)
        )
        const items = listed.items.filter((transition: Transition) => projectVisible(transition.project))
        return items.length === listed.items.length ? listed : { ...listed, items, total: listed.total - (listed.items.length - items.length) }
      },
    },

    commits: {
      status: async transition => {
        await assertTransition(transition)
        return await commitSource().status(transition)
      },

      subscribe: (listener, filter) => commitSource().subscribe(projects == null
        ? listener
        : (event: CommitEvent) => projectVisible(event.project) ? listener(event) : undefined,
      { ...filter, entityId }),

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
      if (runtime.schemaStore() == null) {
        return modelOf<T>(record, facade)
      }
      // A data-defined type answers from the registry of the card's own project.
      const schemas = await runtime.schemasFor(entityId, await projectFor(record))
      return modelOf<T>(record, { ...facade, schemas })
    },
  }

  if (runtime.schemaStore() != null) {
    facade.definitions = makeDefinitions(runtime, facade)
  }

  return facade
}
