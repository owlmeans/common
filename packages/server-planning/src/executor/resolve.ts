import { cardHelper, CardTypeNotAllowed, ParentNotFound, PlanningError, PlanningSchemaKind, PlanningScopeMismatch, SchemaOrigin, specificationHelper, statusHelper, TransitionAction, UnknownStatusFlow, UnknownWorkcardType, WorkcardKind, WorkcardNotFound, type AnyTypeSchema, type PlanningFacade, type PlanningSchemaRegistry, type ProjectTypeSchema, type ScopedSchemaRegistry, type Specification, type TransitionExecution, type Workcard, type WorkcardDraft } from '@owlmeans/planning'
import { makePlanningHierarchy } from '../hierarchy.js'
import { memoHelper } from '@owlmeans/context'
import type { PlanningRuntime } from '../types.js'
import { TRIMMED } from './consts.local.js'
import type { Resolved } from './types.js'
import type { ResolveUtils } from './resolve/types.js'

const isScoped = (schemas: PlanningSchemaRegistry): schemas is ScopedSchemaRegistry =>
  typeof (schemas as Partial<ScopedSchemaRegistry>).originOf === 'function'

/** A type the layer resolves from a data-defined record rather than from code. */
const dataDefined = (schemas: PlanningSchemaRegistry | undefined, type: string): boolean => {
  if (schemas == null || !isScoped(schemas) || !schemas.has(type)) {
    return false
  }
  const origin = schemas.originOf(PlanningSchemaKind.Type, type)
  return origin === SchemaOrigin.Entity || origin === SchemaOrigin.Project
}

const trimmed = (value: unknown): unknown => typeof value === 'string' ? value.trim() : value

const trim = <T extends object>(record: T | undefined): T | undefined => {
  if (record == null) {
    return record
  }
  const copy = { ...record } as Record<string, unknown>
  for (const key of TRIMMED) {
    if (typeof copy[key] === 'string') {
      copy[key] = trimmed(copy[key])
    }
  }
  return copy as T
}

export const makeResolveUtils = (runtime: PlanningRuntime): ResolveUtils => {
  const hierarchy = makePlanningHierarchy(runtime)
  const normalizeExecution = (input: TransitionExecution): TransitionExecution => {
    const exec = structuredClone(input) as TransitionExecution
    if (exec.card != null && typeof exec.card === 'object') {
      const draft = trim(exec.card) as WorkcardDraft
      const parents = cardHelper.normalizeParents(draft.parent, draft.parents)
      exec.card = { ...draft, ...(parents.length > 0 ? { parents, parent: draft.parent ?? parents[0] } : {}) }
    }
    if (exec.changes != null) {
      exec.changes = trim(exec.changes)
    }
    if (exec.unset != null) {
      exec.unset = [...new Set(exec.unset)]
    }
    return exec
  }

  const assertChildAllowed = (
    parent: Workcard, kind: WorkcardKind, type: string, view?: PlanningSchemaRegistry
  ): void => {
    if (kind === WorkcardKind.Specification) {
      return
    }
    const registry = view ?? runtime.service().schemas
    const parentType = registry.type(parent.type) as ProjectTypeSchema
    const childType = registry.has(type) ? registry.type(type) : undefined
    if (childType?.parents?.types != null && !childType.parents.types.includes(parent.type)) throw new CardTypeNotAllowed(`${type}:parent:${parent.type}`)
    if (parentType.children != null) {
      if (!parentType.children.types.includes(type)) throw new CardTypeNotAllowed(`${parent.type}:${type}`)
      return
    }
    if (!cardHelper.isProject(parent)) throw new CardTypeNotAllowed(`${parent.type}:${type}`)
    const allowed = kind === WorkcardKind.Project ? parentType.projectTypes ?? [] : parentType.cardTypes ?? []
    if (allowed.includes(type)) {
      return
    }
    if (kind === WorkcardKind.Card && parentType.scopedCardTypes === true && dataDefined(view, type)) {
      return
    }
    throw new CardTypeNotAllowed(`${parent.type}:${type}`)
  }

  const childViewOf = async (
    entityId: string, parent: Workcard
  ): Promise<PlanningSchemaRegistry | undefined> =>
    runtime.schemaStore() == null ? undefined : await runtime.schemasFor(entityId, await hierarchy.project(parent))

  const resolveExecution = async (
    facade: PlanningFacade, exec: TransitionExecution
  ): Promise<Resolved> => {
    const service = runtime.service()
    const entityId = facade.scope.entityId
    const create = exec.action === TransitionAction.Create
    // Without a schema port every step reads the code registry itself, in today's order; with one,
    // the card's project is found first and the step reads that project's resolved layer.
    const layered = runtime.schemaStore() != null
    let schemas: PlanningSchemaRegistry = service.schemas

    let card: Workcard | undefined
    let type: AnyTypeSchema
    let parent: Workcard | undefined
    let project: string | undefined

    if (create) {
      if (exec.card == null || typeof exec.card !== 'object') {
        throw new PlanningError('malformed:create-without-draft')
      }
      const draft = exec.card
      const parents = cardHelper.normalizeParents(draft.parent, draft.parents)
      const loaded = new Map<string, Workcard>()
      if (layered) {
        // Loaded through the facade, so a parent this scope cannot see is absent here too.
        const primary = parents[0] != null ? await facade.cards.load(parents[0]) : null
        if (parents[0] != null && primary == null) {
          throw new ParentNotFound(parents[0])
        }
        if (primary != null) {
          loaded.set(parents[0], primary)
        }
        const project = draft.kind === WorkcardKind.Project || primary == null
          ? undefined
          : await hierarchy.project({ kind: draft.kind, entityId, parent: parents[0], parents } as unknown as Workcard)
        schemas = await runtime.schemasFor(entityId, project)
      }
      type = schemas.type(draft.type)
      if (type.kind !== draft.kind) {
        throw new PlanningError(`malformed:kind:${draft.type}:${draft.kind}`)
      }
      if (layered && isScoped(schemas) && schemas.isRetired(PlanningSchemaKind.Type, draft.type)) {
        // Existing cards keep resolving a retired type; nothing new is made of it.
        throw new UnknownWorkcardType(`retired:${draft.type}`)
      }
      // Normalized: the primary parent is first. It must accept the child; so must every project
      // among the secondary parents.
      for (const [index, id] of parents.entries()) {
        const found = loaded.get(id) ?? await facade.cards.load(id)
        if (found == null) {
          throw new ParentNotFound(id)
        }
        if (index === 0) {
          parent = found
        }
        if (found != null) {
          const view = !layered ? undefined : index === 0 && cardHelper.isProject(found) ? schemas : await childViewOf(entityId, found)
          assertChildAllowed(found, draft.kind, draft.type, view)
        }
      }
      if (draft.kind === WorkcardKind.Specification && parent == null) {
        throw new PlanningError('malformed:specification-without-parent')
      }
    } else {
      if (typeof exec.card !== 'string' || exec.card === '') {
        throw new PlanningError(`malformed:${exec.action}-without-card`)
      }
      const found = await runtime.reader().cards.get(exec.card, entityId)
      if (found == null) {
        throw new WorkcardNotFound(exec.card)
      }
      if (found.entityId !== entityId) {
        throw new PlanningScopeMismatch(exec.card)
      }
      if (facade.scope.projects != null && await facade.cards.load(exec.card) == null) {
        // Outside the scope's projects: absent, exactly like another entity's card.
        throw new WorkcardNotFound(exec.card)
      }
      card = found
      if (layered) {
        parent = card.parent != null ? await facade.cards.load(card.parent) ?? undefined : undefined
        schemas = await runtime.schemasFor(entityId, await hierarchy.project(card))
        type = schemas.type(card.type)
      } else {
        type = schemas.type(card.type)
        parent = card.parent != null ? await facade.cards.load(card.parent) ?? undefined : undefined
      }
    }

    project = card != null ? await hierarchy.project(card)
      : (exec.card as WorkcardDraft).kind === WorkcardKind.Project ? undefined
        : await hierarchy.project({ ...(exec.card as WorkcardDraft), entityId } as Workcard)
    const flowId = exec.flow ?? statusHelper.primaryFlowOf(type)
    if (!type.flows.includes(flowId)) {
      throw new UnknownStatusFlow(`${type.type}:${flowId}`)
    }

    const kind = create ? (exec.card as WorkcardDraft).kind : card!.kind
    const category = create ? (exec.card as WorkcardDraft).category : (card as Specification | undefined)?.category
    const slot = kind === WorkcardKind.Specification && parent != null && category != null
      ? specificationHelper.slotOf(schemas.type(parent.type), category)
      : undefined

    return {
      create,
      project,
      ...(card != null ? { card } : {}),
      type,
      flowId,
      flow: schemas.flow(flowId),
      ...(parent != null ? { parent } : {}),
      ...(slot != null ? { slot } : {}),
      store: service.store(type.type),
      schemas,
    }
  }

  const projectFor = (resolved: Resolved, exec: TransitionExecution, cardId: string): string | undefined => {
    if (resolved.card != null) {
      return cardHelper.isProject(resolved.card) ? resolved.card.id : resolved.project
    }
    const draft = exec.card as WorkcardDraft
    if (draft.kind === WorkcardKind.Project) {
      return cardId
    }
    return resolved.project
  }

  return { normalizeExecution, assertChildAllowed, childViewOf, resolveExecution, projectFor }
}

/** The resolution steps of one service runtime — one per runtime. */
export const resolveUtilsOf = memoHelper.oncePer(makeResolveUtils)
