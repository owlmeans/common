import {
  CardTypeNotAllowed, isProject, normalizeParents, ParentNotFound, PlanningError, PlanningScopeMismatch,
  primaryFlowOf, projectOf, slotOf, TransitionAction, UnknownStatusFlow, WorkcardKind, WorkcardNotFound,
} from '@owlmeans/planning'
import type {
  AnyTypeSchema, PlanningFacade, PlanningStore, ProjectTypeSchema, Specification, SpecificationSlot,
  StatusFlowSchema, TransitionExecution, Workcard, WorkcardDraft,
} from '@owlmeans/planning'
import type { PlanningRuntime } from '../service.js'

/** Everything the steps after resolution read about an execution. */
export interface Resolved {
  create: boolean
  /** The existing card (not a create). */
  card?: Workcard
  type: AnyTypeSchema
  flowId: string
  flow: StatusFlowSchema
  /** The primary parent, when it resolves. */
  parent?: Workcard
  /** The slot a specification belongs to. */
  slot?: SpecificationSlot
  /** The store the type is written to. */
  store: PlanningStore
}

const trimmed = (value: unknown): unknown => typeof value === 'string' ? value.trim() : value

const TRIMMED = ['title', 'description', 'code'] as const

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

/**
 * Step 1: a deep copy with trimmed text, `parents ∋ parent` on a draft, and no duplicate `unset`
 * paths. The caller's object is never touched.
 */
export const normalizeExecution = (input: TransitionExecution): TransitionExecution => {
  const exec = structuredClone(input) as TransitionExecution
  if (exec.card != null && typeof exec.card === 'object') {
    const draft = trim(exec.card) as WorkcardDraft
    const parents = normalizeParents(draft.parent, draft.parents)
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

/** The parent type's rule for a child of `kind`/`type`. @throws {CardTypeNotAllowed} */
export const assertChildAllowed = (
  runtime: PlanningRuntime, parent: Workcard, kind: WorkcardKind, type: string
): void => {
  if (kind === WorkcardKind.Specification) {
    return
  }
  if (!isProject(parent)) {
    throw new CardTypeNotAllowed(`${parent.type}:${type}`)
  }
  const parentType = runtime.service().schemas.type(parent.type) as ProjectTypeSchema
  const allowed = kind === WorkcardKind.Project ? parentType.projectTypes ?? [] : parentType.cardTypes ?? []
  if (!allowed.includes(type)) {
    throw new CardTypeNotAllowed(`${parent.type}:${type}`)
  }
}

/**
 * Step 4: the card, its type and flow, its parent and — for a specification — its slot.
 *
 * @throws {WorkcardNotFound | PlanningScopeMismatch | UnknownWorkcardType | UnknownStatusFlow}
 * @throws {ParentNotFound | CardTypeNotAllowed | PlanningError}
 */
export const resolveExecution = async (
  runtime: PlanningRuntime, facade: PlanningFacade, exec: TransitionExecution
): Promise<Resolved> => {
  const service = runtime.service()
  const schemas = service.schemas
  const entityId = facade.scope.entityId
  const create = exec.action === TransitionAction.Create

  let card: Workcard | undefined
  let type: AnyTypeSchema
  let parent: Workcard | undefined

  if (create) {
    if (exec.card == null || typeof exec.card !== 'object') {
      throw new PlanningError('malformed:create-without-draft')
    }
    const draft = exec.card
    type = schemas.type(draft.type)
    if (type.kind !== draft.kind) {
      throw new PlanningError(`malformed:kind:${draft.type}:${draft.kind}`)
    }
    // Normalized: the primary parent is first. It must accept the child; so must every project
    // among the secondary parents.
    for (const [index, id] of normalizeParents(draft.parent, draft.parents).entries()) {
      const found = await facade.cards.load(id)
      if (found == null) {
        throw new ParentNotFound(id)
      }
      if (index === 0) {
        parent = found
      }
      if (index === 0 || isProject(found)) {
        assertChildAllowed(runtime, found, draft.kind, draft.type)
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
    card = found
    type = schemas.type(card.type)
    parent = card.parent != null ? await facade.cards.load(card.parent) ?? undefined : undefined
  }

  const flowId = exec.flow ?? primaryFlowOf(type)
  if (!type.flows.includes(flowId)) {
    throw new UnknownStatusFlow(`${type.type}:${flowId}`)
  }

  const kind = create ? (exec.card as WorkcardDraft).kind : card!.kind
  const category = create ? (exec.card as WorkcardDraft).category : (card as Specification | undefined)?.category
  const slot = kind === WorkcardKind.Specification && parent != null && category != null
    ? slotOf(schemas.type(parent.type), category)
    : undefined

  return {
    create,
    ...(card != null ? { card } : {}),
    type,
    flowId,
    flow: schemas.flow(flowId),
    ...(parent != null ? { parent } : {}),
    ...(slot != null ? { slot } : {}),
    store: service.store(type.type),
  }
}

/** The project a transition is filed under: a project's own id, else its parent's project. */
export const projectFor = (resolved: Resolved, exec: TransitionExecution, cardId: string): string | undefined => {
  if (resolved.card != null) {
    return isProject(resolved.card) ? resolved.card.id : projectOf(resolved.card, resolved.parent)
  }
  const draft = exec.card as WorkcardDraft
  if (draft.kind === WorkcardKind.Project) {
    return cardId
  }
  return projectOf({ kind: draft.kind, parent: draft.parent, parents: draft.parents ?? [] } as unknown as Workcard, resolved.parent)
}
