import { BODY_MAX, cardHelper, changesHelper, CODE_MAX, codeHelper, FORMER_CODES_FIELD, RetypeNotAllowed, DESCRIPTION_MAX, IllegalTransition, LabelNotAllowed, MAX_LABELS, MAX_PARENTS, ParentNotFound, PlanningError, RelationshipRefused, specificationHelper, SpecificationRevisionConflict, SpecificationSlotUnknown, statusHelper, TITLE_MAX, TransitionAction, validateHelper, WorkcardKind, PlanningResourceKind, type PlanningFacade, type RelationshipDraft, type Specification, type TransitionExecution, type WorkcardDraft } from '@owlmeans/planning'
import type { PlanningRuntime } from '../types.js'
import { creatorHelper } from './creator.js'
import type { Resolved } from './types.js'
import { ACTIONS } from './consts.local.js'
import { resolveUtilsOf } from './resolve.js'

const malformed = (what: string): PlanningError => new PlanningError(`malformed:${what}`)

const assertText = (name: string, value: unknown, max: number, required: boolean): void => {
  if (value === undefined || value === null) {
    if (required) {
      throw malformed(name)
    }
    return
  }
  if (typeof value !== 'string' || (required && value === '') || value.length > max) {
    throw malformed(name)
  }
}

const assertShape = (exec: TransitionExecution, resolved: Resolved): void => {
  if (!ACTIONS.has(exec.action)) {
    throw malformed(`action:${exec.action}`)
  }
  if (exec.links != null && exec.action !== TransitionAction.Create) {
    throw malformed('links-outside-create')
  }
  if (exec.action === TransitionAction.Transit && (exec.transition == null || exec.transition === '')) {
    throw malformed('transit-without-transition')
  }
  if (exec.action === TransitionAction.Retype && (exec.toType == null || exec.toType === '')) {
    throw malformed('retype-without-type')
  }
  if (exec.action !== TransitionAction.Retype && exec.toType != null) {
    throw malformed('to-type-outside-retype')
  }
  if ((exec.action === TransitionAction.Link || exec.action === TransitionAction.Unlink)
    && (exec.link?.to == null || exec.link.to === '' || exec.link.type == null || exec.link.type === '')) {
    throw malformed(`${exec.action}-without-link`)
  }
  if (resolved.create) {
    const draft = exec.card as WorkcardDraft
    assertText('title', draft.title, TITLE_MAX, true)
    assertText('description', draft.description, DESCRIPTION_MAX, false)
    assertText('code', draft.code, CODE_MAX, false)
    if ((draft.parents?.length ?? 0) > MAX_PARENTS) {
      throw malformed('parents')
    }
  }
  const changes = exec.changes ?? {}
  if (changes.title !== undefined) {
    assertText('title', changes.title, TITLE_MAX, true)
  }
  assertText('description', changes.description ?? undefined, DESCRIPTION_MAX, false)
  assertText('code', changes.code ?? undefined, CODE_MAX, false)
}

const assertFlow = (exec: TransitionExecution, resolved: Resolved): void => {
  if (resolved.create) {
    const status = (exec.card as WorkcardDraft).status
    const primary = resolved.schemas.primaryFlow(resolved.type.type)
    if (status != null && !primary.statuses.some(definition => definition.key === status)) {
      throw new IllegalTransition(`${primary.id}:create:${status}`)
    }
    return
  }
  if (exec.action !== TransitionAction.Transit) {
    return
  }
  const card = resolved.card!
  const from = card.flows[resolved.flowId] ?? card.status
  if (statusHelper.ruleOf(resolved.flow, exec.transition!, from) == null) {
    throw new IllegalTransition(`${resolved.flowId}:${exec.transition}:${from}`)
  }
}

const assertFields = (exec: TransitionExecution, resolved: Resolved): void => {
  const schemas = resolved.schemas
  if (resolved.create) {
    const draft = exec.card as WorkcardDraft
    validateHelper.validateFields(schemas, resolved.type.type, changesHelper.mergeFields(draft.fields, exec.changes?.fields))
    return
  }
  const clears = (exec.unset ?? []).filter(path => path.startsWith('fields.'))
  if (exec.action === TransitionAction.Retype) {
    // Every field the card keeps must fit the type it becomes — the former codes the code step will
    // append included.
    const card = resolved.card!
    const target = resolved.target!
    const kept = changesHelper.applyUnset({ fields: changesHelper.mergeFields(card.fields, exec.changes?.fields) }, clears).fields
    const former = codeHelper.remintsOn(target.code, card.code) && card.code != null && card.code !== ''
      ? { [FORMER_CODES_FIELD]: codeHelper.formerCodesOf(card.fields, card.code) }
      : {}
    validateHelper.validateFields(schemas, target.type, { ...kept, ...former })
    return
  }
  if (exec.changes?.fields == null && clears.length === 0) {
    return
  }
  const merged = changesHelper.applyUnset({ fields: changesHelper.mergeFields(resolved.card!.fields, exec.changes?.fields) }, clears)
  validateHelper.validateFields(schemas, resolved.type.type, merged.fields)
}

const assertLabels = (exec: TransitionExecution, resolved: Resolved): void => {
  const retype = exec.action === TransitionAction.Retype
  const labels = [
    ...(resolved.create ? (exec.card as WorkcardDraft).labels ?? [] : []),
    // A retype keeps the card's labels unless it replaces them: the new type must allow them.
    ...(exec.changes?.labels ?? (retype ? resolved.card?.labels ?? [] : [])),
  ]
  if (labels.length === 0) {
    return
  }
  if (new Set(labels).size > MAX_LABELS) {
    throw new LabelNotAllowed(`too-many:${labels.length}`)
  }
  const allowed = retype ? resolved.target?.labels : resolved.type.labels
  const refused = allowed == null ? undefined : labels.find(label => !allowed.includes(label))
  if (refused != null) {
    throw new LabelNotAllowed(refused)
  }
}

const assertParentMove = async (
  exec: TransitionExecution, resolved: Resolved, runtime: PlanningRuntime, facade: PlanningFacade
): Promise<void> => {
  if (resolved.create) {
    return
  }
  const changes = exec.changes ?? {}
  const resolve = resolveUtilsOf(runtime)
  const moved = [...new Set(cardHelper.normalizeParents(changes.parent, changes.parents))]
    .filter(id => id !== resolved.card!.parent && !resolved.card!.parents.includes(id))
  for (const id of moved) {
    if (id === resolved.card!.id) {
      throw malformed('parent-self')
    }
    const found = await facade.cards.load(id)
    if (found == null) {
      throw new ParentNotFound(id)
    }
    resolve.assertChildAllowed(
      found, resolved.card!.kind, resolved.card!.type, await resolve.childViewOf(facade.scope.entityId, found)
    )
  }
}

const assertSpecification = async (
  exec: TransitionExecution, resolved: Resolved, facade: PlanningFacade
): Promise<void> => {
  const kind = resolved.create ? (exec.card as WorkcardDraft).kind : resolved.card!.kind
  if (kind !== WorkcardKind.Specification) {
    return
  }
  const schemas = resolved.schemas

  if (resolved.create) {
    const draft = exec.card as WorkcardDraft
    const parent = resolved.parent!
    if (draft.category == null || draft.category === '') {
      throw malformed('specification-without-category')
    }
    const slot = specificationHelper.slotOf(schemas.type(parent.type), draft.category)
    if (slot == null) {
      throw new SpecificationSlotUnknown(`${parent.type}:${draft.category}`)
    }
    if (draft.format != null && draft.format !== slot.format) {
      throw malformed(`format:${draft.category}:${draft.format}`)
    }
    assertText('body', draft.body, BODY_MAX, false)
    validateHelper.validateSpecificationBody(slot, draft.body)
    if (slot.multiple !== true && await facade.specifications.current(parent.id!, draft.category) != null) {
      throw new SpecificationRevisionConflict(`${parent.id}:${draft.category}`)
    }
    return
  }

  const spec = resolved.card as Specification
  const changes = exec.changes ?? {}
  if (changes.category !== undefined && changes.category !== spec.category) {
    throw new PlanningError('immutable:category')
  }
  const slot = resolved.slot
  if (slot == null) {
    return
  }
  if (changes.format != null && changes.format !== slot.format) {
    throw malformed(`format:${spec.category}:${changes.format}`)
  }
  if (changes.body != null) {
    assertText('body', changes.body, BODY_MAX, false)
    validateHelper.validateSpecificationBody(slot, changes.body)
  }
}

const assertRelationships = async (
  exec: TransitionExecution, resolved: Resolved, facade: PlanningFacade
): Promise<void> => {
  const drafts: RelationshipDraft[] = exec.action === TransitionAction.Create
    ? exec.links ?? []
    : exec.action === TransitionAction.Link || exec.action === TransitionAction.Unlink ? [exec.link!] : []
  if (drafts.length === 0) {
    return
  }
  const cardId = resolved.card?.id
  const declared = resolved.type.relationships ?? []
  const counted = new Map<string, number>()

  for (const draft of drafts) {
    const rule = declared.find(entry => entry.name === draft.type)
    if (rule == null) {
      throw new RelationshipRefused(`unknown:${draft.type}`)
    }
    if (draft.from != null && draft.from !== cardId) {
      throw new RelationshipRefused(`from:${draft.from}`)
    }
    if (exec.action === TransitionAction.Unlink) {
      const existing = await facade.relationships.list({ from: cardId, to: draft.to, type: draft.type })
      if (existing.total === 0) {
        throw new RelationshipRefused(`absent:${draft.type}:${draft.to}`)
      }
      continue
    }
    const kind = rule.toKind ?? PlanningResourceKind.Workcard
    if (draft.toKind != null && draft.toKind !== kind) throw new RelationshipRefused(`to-kind:${draft.type}`)
    if (draft.fromKind != null && draft.fromKind !== PlanningResourceKind.Workcard) throw new RelationshipRefused(`from-kind:${draft.type}`)
    draft.toKind = kind
    const target = kind === PlanningResourceKind.Assignee ? await facade.assignees.load(draft.to)
      : kind === PlanningResourceKind.Team ? await facade.teams.load(draft.to) : await facade.cards.load(draft.to)
    if (target == null) {
      throw new RelationshipRefused(`to:${draft.to}`)
    }
    if (rule.from != null && !rule.from.includes(resolved.type.type)) {
      throw new RelationshipRefused(`from-type:${draft.type}:${resolved.type.type}`)
    }
    if (rule.to != null && !rule.to.includes('type' in target ? target.type : '')) {
      throw new RelationshipRefused(`to-type:${draft.type}:${'type' in target ? target.type : kind}`)
    }
    if (rule.single === true) {
      const count = (counted.get(draft.type) ?? 0) + 1
      counted.set(draft.type, count)
      const existing = cardId == null
        ? 0
        : (await facade.relationships.list({ from: cardId, type: draft.type })).items
          .filter(link => link.to !== draft.to).length
      if (count + existing > 1) {
        throw new RelationshipRefused(`single:${draft.type}`)
      }
    }
  }
}

/** Edges between two cards: an assignee or a team at either end is a reference, not a card link. */
const cardEdge = (edge: { fromKind?: PlanningResourceKind, toKind?: PlanningResourceKind }): boolean =>
  (edge.fromKind ?? PlanningResourceKind.Workcard) === PlanningResourceKind.Workcard
  && (edge.toKind ?? PlanningResourceKind.Workcard) === PlanningResourceKind.Workcard

/**
 * A retype's own checks: another type of the same kind that the current type lists in `retypes`,
 * written to the same store; no parent moved by it; every flow of the new type declaring the status
 * the card holds in it; every parent admitting the new type; every document's slot declared by the new
 * type with the same format; every card link still fitting the relationship rules from either end.
 * Fields and labels are checked against the new type by their own steps; the children against it by
 * the projection invariants (`hierarchy` with the card retyped).
 *
 * @throws {RetypeNotAllowed | CardTypeNotAllowed | ParentNotFound | RelationshipRefused | PlanningError}
 */
const assertRetype = async (
  exec: TransitionExecution, resolved: Resolved, runtime: PlanningRuntime, facade: PlanningFacade
): Promise<void> => {
  if (exec.action !== TransitionAction.Retype) {
    return
  }
  const card = resolved.card!
  const from = resolved.type
  const target = resolved.target!
  if (target.type === from.type) {
    throw new RetypeNotAllowed(`same:${from.type}`)
  }
  if (target.kind !== card.kind) {
    throw new RetypeNotAllowed(`kind:${from.type}:${target.type}`)
  }
  if (!(from.retypes ?? []).includes(target.type)) {
    throw new RetypeNotAllowed(`${from.type}:${target.type}`)
  }
  if (runtime.service().store(target.type) !== resolved.store) {
    throw new RetypeNotAllowed(`store:${target.type}`)
  }
  const changes = exec.changes ?? {}
  if (changes.parent !== undefined || changes.parents !== undefined
    || (exec.unset ?? []).some(path => path === 'parent' || path === 'parents')) {
    throw malformed('retype-moves-parent')
  }

  const primary = statusHelper.primaryFlowOf(from)
  for (const flowId of target.flows) {
    const status = card.flows[flowId] ?? (flowId === primary ? card.status : undefined)
    if (status == null || statusHelper.statusDefinitionOf(resolved.schemas.flow(flowId), status) == null) {
      throw new RetypeNotAllowed(`status:${flowId}:${status ?? ''}`)
    }
  }

  const resolve = resolveUtilsOf(runtime)
  for (const id of card.parents) {
    const parent = await facade.cards.load(id)
    if (parent == null) {
      throw new ParentNotFound(id)
    }
    resolve.assertChildAllowed(parent, card.kind, target.type, await resolve.childViewOf(facade.scope.entityId, parent))
  }

  const documents = await facade.specifications.list(card.id!, { size: 0 })
  for (const document of documents.items) {
    const slot = specificationHelper.slotOf(target, document.category)
    if (slot == null || slot.format !== document.format) {
      throw new RetypeNotAllowed(`document:${document.category}`)
    }
  }

  const outgoing = await facade.relationships.list({ from: card.id!, size: 0 })
  for (const edge of outgoing.items.filter(cardEdge)) {
    const rule = target.relationships?.find(entry => entry.name === edge.type)
    if (rule == null) {
      throw new RelationshipRefused(`retype:unknown:${edge.type}`)
    }
    if (rule.field != null) {
      continue
    }
    if (rule.from != null && !rule.from.includes(target.type)) {
      throw new RelationshipRefused(`retype:from-type:${edge.type}:${target.type}`)
    }
    const to = rule.to != null ? await facade.cards.load(edge.to) : null
    if (rule.to != null && (to == null || !rule.to.includes(to.type))) {
      throw new RelationshipRefused(`retype:to-type:${edge.type}:${to?.type ?? edge.to}`)
    }
  }
  const incoming = await facade.relationships.list({ to: card.id!, size: 0 })
  for (const edge of incoming.items.filter(cardEdge)) {
    const owner = await facade.cards.load(edge.from)
    const rule = owner == null ? undefined : resolved.schemas.has(owner.type)
      ? resolved.schemas.type(owner.type).relationships?.find(entry => entry.name === edge.type) : undefined
    if (rule?.to != null && !rule.to.includes(target.type)) {
      throw new RelationshipRefused(`retype:to-type:${edge.type}:${target.type}`)
    }
  }
}

/**
 * Step 6: shape, flow rule, immutables (`createdBy` among them, `creatorHelper.assertCreatorFixed`),
 * a retype's own checks, `fields` and labels (a retype's against the type it makes), parent moves,
 * the specification slot and relationships — in that order.
 * Nothing is written by a refusal here.
 *
 * @throws {PlanningError} `malformed:*` / `immutable:*`
 * @throws {IllegalTransition | FieldsInvalid | LabelNotAllowed | ParentNotFound | CardTypeNotAllowed}
 * @throws {SpecificationSlotUnknown | SpecificationRevisionConflict | RelationshipRefused | RetypeNotAllowed}
 */
export const validateExecution = async (
  runtime: PlanningRuntime, facade: PlanningFacade, exec: TransitionExecution, resolved: Resolved
): Promise<void> => {
  assertShape(exec, resolved)
  assertFlow(exec, resolved)
  changesHelper.assertMutable(exec, resolved.type)
  creatorHelper.assertCreatorFixed(exec)
  await assertRetype(exec, resolved, runtime, facade)
  assertFields(exec, resolved)
  assertLabels(exec, resolved)
  await assertParentMove(exec, resolved, runtime, facade)
  await assertSpecification(exec, resolved, facade)
  await assertRelationships(exec, resolved, facade)
}
