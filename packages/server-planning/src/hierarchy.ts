import {
  CardTypeNotAllowed, FieldsInvalid, ParentNotFound, PlanningError, PlanningSchemaKind, SchemaOrigin,
  WorkcardKind, type Workcard, type PlanningSchemaRegistry, type ProjectTypeSchema, type ScopedSchemaRegistry,
} from '@owlmeans/planning'
import type { PlanningRuntime } from './types.js'
import type { PlanningHierarchy } from './hierarchy/types.js'

/** One recursive resolver for schema inheritance, project authorization and hierarchy constraints. */
export const makePlanningHierarchy = (runtime: PlanningRuntime): PlanningHierarchy => {
  const cards = () => runtime.reader().cards
  const ancestors: PlanningHierarchy['ancestors'] = async card => {
    const visited = new Set<string>()
    const result: Workcard[] = []
    const visit = async (id: string, path: Set<string>): Promise<void> => {
      if (path.has(id)) throw new PlanningError(`hierarchy:cycle:${id}`)
      if (visited.has(id)) return
      const parent = await cards().get(id, card.entityId)
      if (parent == null || parent.entityId !== card.entityId) throw new ParentNotFound(id)
      const next = new Set([...path, id])
      for (const reference of parent.parents) await visit(reference, next)
      visited.add(id)
      result.push(parent)
    }
    for (const id of card.parents) await visit(id, new Set())
    return result
  }
  const project: PlanningHierarchy['project'] = async card => {
    if (card.kind === WorkcardKind.Project) return card.id
    const visited = new Set<string>()
    let parent = card.parent
    while (parent != null) {
      if (visited.has(parent)) throw new PlanningError(`hierarchy:cycle:${parent}`)
      visited.add(parent)
      const found = await cards().get(parent, card.entityId)
      if (found == null) throw new ParentNotFound(parent)
      if (found.kind === WorkcardKind.Project) return found.id
      parent = found.parent
    }
    return undefined
  }
  const descendants: PlanningHierarchy['descendants'] = async (id, entityId) => {
    const found = new Map<string, Workcard>()
    let frontier = [id]
    while (frontier.length > 0) {
      const result = await cards().list({ entityId, parents: { $overlaps: frontier }, kind: [WorkcardKind.Card, WorkcardKind.Project, WorkcardKind.Specification] } as never, { size: 0 })
      frontier = []
      for (const card of result.items) if (card.id !== id && !found.has(card.id!)) { found.set(card.id!, card); frontier.push(card.id!) }
    }
    return [...found.values()]
  }
  const assertPair = (parent: Workcard, card: Workcard, schemas: PlanningSchemaRegistry): void => {
    if (card.kind === WorkcardKind.Specification) return
    const childType = schemas.type(card.type)
    if (childType.parents?.types != null && !childType.parents.types.includes(parent.type)) throw new CardTypeNotAllowed(`${card.type}:parent:${parent.type}`)
    const parentType = schemas.type(parent.type)
    if (parentType.children != null) {
      if (!parentType.children.types.includes(card.type)) throw new CardTypeNotAllowed(`${parent.type}:child:${card.type}`)
      return
    }
    if (parent.kind !== WorkcardKind.Project) throw new CardTypeNotAllowed(`${parent.type}:child:${card.type}`)
    const container = parentType as ProjectTypeSchema
    const allowed = card.kind === WorkcardKind.Project ? container.projectTypes ?? [] : container.cardTypes
    const origin = (schemas as Partial<ScopedSchemaRegistry>).originOf?.(PlanningSchemaKind.Type, card.type)
    if (!allowed.includes(card.type) && !(card.kind === WorkcardKind.Card && container.scopedCardTypes && (origin === SchemaOrigin.Project || origin === SchemaOrigin.Entity))) throw new CardTypeNotAllowed(`${parent.type}:${card.type}`)
  }
  const hierarchy: PlanningHierarchy = {
    ancestors,
    project,
    descendants,
    projects: async card => [...new Set([...(card.kind === WorkcardKind.Project ? [card.id!] : []), ...(await ancestors(card)).filter(parent => parent.kind === WorkcardKind.Project).map(parent => parent.id!)])],
    visible: async (card, projects) => projects == null || (await hierarchy.projects(card)).some(id => projects.includes(id)),
    validate: async (card, deleting = false) => {
      if (deleting) {
        if (card.kind === WorkcardKind.Project) return
        if ((await descendants(card.id!, card.entityId)).length > 0) throw new PlanningError(`hierarchy:parent-in-use:${card.id}`)
        return
      }
      const schemas = await runtime.schemasFor(card.entityId, await project(card))
      const type = schemas.type(card.type)
      if (type.parents?.required && card.parent == null) throw new ParentNotFound(`required:${card.type}`)
      if (card.parent != null && !card.parents.includes(card.parent)) throw new FieldsInvalid('hierarchy:primary-membership')
      const parents = await ancestors(card)
      if (parents.some(parent => parent.id === card.id)) throw new PlanningError(`hierarchy:cycle:${card.id}`)
      for (const id of card.parents) {
        const parent = parents.find(parent => parent.id === id)!
        assertPair(parent, card, await runtime.schemasFor(card.entityId, await project(parent)))
      }
      if (card.parent != null) card.parentType = parents.find(parent => parent.id === card.parent)!.type
      else delete card.parentType
    },
  }
  return hierarchy
}
