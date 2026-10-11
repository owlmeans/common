import { cardHelper, modelOf, PlanningResourceKind, PlanningUnsupported, queryHelper, specificationHelper, WorkcardKind, WorkcardNotFound, type CommitEvent, type CommitSource, type PlanningFacade, type PlanningScope, type Relationship, type Specification, type Transition, type Workcard, type WorkcardModel, type WorkcardQuery } from '@owlmeans/planning'
import { recordQueryHelper } from '@owlmeans/resource'
import type { Criteria } from '@owlmeans/resource'
import { makeResourceFacade } from './resources.js'
import { makeDefinitions } from './definitions.js'
import { executeTransition } from './executor.js'
import type { PlanningRuntime } from './types.js'
import { makePlanningHierarchy } from './hierarchy.js'
import type { CommitHub } from './store/types.js'

/**
 * The criteria a scope narrowed to `projects` adds to every card list, count and summary: the
 * projects themselves, every card whose `parents` name one of them, and the specifications whose
 * parent card is one of `through` — the cards of those projects a specification is seen through,
 * exactly as a single read sees it (a specification's `parents` hold only its own card).
 */
export const projectCriteriaOf = (projects: readonly string[], through: readonly string[] = []): Criteria<Workcard> => ({
  $or: [
    { id: { $in: [...projects] } },
    { parents: { $overlaps: [...projects] } },
    ...(through.length > 0 ? [{ kind: WorkcardKind.Specification, parent: { $in: [...through] } }] : []),
  ],
}) as Criteria<Workcard>

/**
 * The scoped facade over the service's stores.
 *
 * Every read carries the scope's `entityId` into the store and re-checks it on what comes back, so
 * a card of another entity is simply absent — `load` answers `null`, `get` throws
 * `WorkcardNotFound`, exactly as for an id that never existed. Reads go through the composite
 * store (the default store plus the stores plugins own); writes go through the executor.
 *
 * A scope naming `projects` sees those projects, the cards whose `parents` name one of them, and a
 * specification whose parent card is one of those (a card's specification through its card);
 * everything else reads as absent. Lists, counts and summaries are narrowed by an AND'd criteria
 * that admits the same cards a single read does — the parent cards a specification is seen through
 * are resolved once per call ({@link projectCriteriaOf}) — and commit events and transitions
 * outside the set are dropped or refused.
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

  const hierarchy = makePlanningHierarchy(runtime)
  const visible = async (card: Workcard | null): Promise<Workcard | null> =>
    card != null && await hierarchy.visible(card, projects) ? card : null
  const allowedIds = async (): Promise<string[]> => {
    if (projects == null) return []
    const result = new Set<string>()
    for (const project of projects) {
      const root = mine(await reader().cards.get(project, entityId))
      if (root == null) continue
      result.add(project)
      for (const card of await hierarchy.descendants(project, entityId)) result.add(card.id!)
    }
    return [...result]
  }
  const narrow = async (where: Criteria<Workcard>): Promise<Criteria<Workcard>> => projects == null ? where
    : { ...where, $and: [...(where.$and ?? []), { id: { $in: await allowedIds() } }] }
  const narrowed = async (query?: WorkcardQuery | null): Promise<Criteria<Workcard>> => await narrow(queryHelper.criteriaOf(query, scope))
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
  const transitionVisible = async (row: Pick<Transition, 'card' | 'project'>): Promise<boolean> => {
    if (projects == null) return true
    const card = mine(await reader().cards.get(row.card, entityId))
    return card != null ? await hierarchy.visible(card, projects) : projectVisible(row.project)
  }
  const assertTransition = async (transition: string): Promise<void> => {
    const row = await reader().transitions?.get(transition)
    if (row != null) {
      if (row.entityId !== entityId || !await transitionVisible(row)) {
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
  const projectFor = async (card: Workcard): Promise<string | undefined> => await hierarchy.project(card)

  const facade: PlanningFacade = {
    ...makeResourceFacade(runtime, () => facade),
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

      list: async query => await reader().cards.list(await narrowed(query), queryHelper.listOptionsOf(query)),

      count: async query => await reader().cards.count(await narrowed(query)),

      summary: async (parents, query) => parents.length === 0
        ? {}
        : await reader().cards.summary(parents, await narrow(queryHelper.criteriaOf({ kind: query?.kind, type: query?.type }, scope))),
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
        const listed = await reader().cards.list(queryHelper.specCriteriaOf(parent, { category }, scope) as never, { size: 0 })
        return specificationHelper.currentSpecification(listed.items, category)
      },

      list: async (parent, query) => {
        if (projects != null && await facade.cards.load(parent) == null) {
          return { items: [], total: 0 }
        }
        const specs = reader().specs
        if (specs != null) {
          return await specs.list(parent, entityId, query)
        }
        return await reader().cards.list(queryHelper.specCriteriaOf(parent, query, scope) as never, queryHelper.listOptionsOf(query) as never) as never
      },

      get: async id => {
        const card = await facade.cards.load(id)
        if (card == null || !cardHelper.isSpecification(card)) {
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
        const where = queryHelper.linkWhereOf(query, scope)
        // Inverse names are views over the canonical edge, never separately stored links.
        const stored = await links.list(query?.type != null ? { entityId, id: where.id, project: where.project } : where, { size: 0 })
        const names = query?.type == null ? undefined : Array.isArray(query.type) ? query.type : [query.type]
        const presented: Relationship[] = []
        for (const link of stored.items) {
          if (names == null || names.includes(link.type)) presented.push(link)
          if (names == null || (link.fromKind ?? PlanningResourceKind.Workcard) !== PlanningResourceKind.Workcard) continue
          const source = await reader().cards.get(link.from, entityId)
          if (source == null) continue
          const rules = (await runtime.schemasFor(entityId, await hierarchy.project(source))).type(source.type).relationships ?? []
          for (const rule of rules) if (rule.name === link.type && rule.inverse != null && names.includes(rule.inverse)) {
            presented.push({ ...link, type: rule.inverse, from: link.to, to: link.from,
              fromKind: link.toKind ?? PlanningResourceKind.Workcard, toKind: link.fromKind ?? PlanningResourceKind.Workcard })
          }
        }
        const items: Relationship[] = []
        for (const link of presented) {
          if (projects == null) { items.push(link); continue }
          const endpoints: string[] = []
          if ((link.fromKind ?? PlanningResourceKind.Workcard) === PlanningResourceKind.Workcard) endpoints.push(link.from)
          if ((link.toKind ?? PlanningResourceKind.Workcard) === PlanningResourceKind.Workcard) endpoints.push(link.to)
          if (endpoints.length === 0) continue
          let admitted = true
          for (const id of endpoints) if (await facade.cards.load(id) == null) { admitted = false; break }
          if (admitted) items.push(link)
        }
        return recordQueryHelper.applyQuery(items, where as Criteria<Relationship>, queryHelper.listOptionsOf(query))
      },
    },

    transitions: {
      get: async id => {
        const transition = mine(await reader().transitions?.get(id))
        if (transition == null || !await transitionVisible(transition)) {
          throw new WorkcardNotFound(`transition:${id}`)
        }
        return transition
      },

      list: async query => {
        const transitions = reader().transitions
        if (transitions == null) {
          return { items: [], total: 0 }
        }
        const listed = await transitions.list(queryHelper.transitionWhereOf(query, scope), { size: 0 })
        const items: Transition[] = []
        for (const transition of listed.items) if (await transitionVisible(transition)) items.push(transition)
        return recordQueryHelper.applyQuery(items, undefined, queryHelper.listOptionsOf(query))
      },
    },

    commits: {
      status: async transition => {
        await assertTransition(transition)
        return await commitSource().status(transition)
      },

      subscribe: (listener, filter) => commitSource().subscribe(projects == null
        ? listener
        : async (event: CommitEvent) => await transitionVisible(event) ? await listener(event) : undefined,
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
