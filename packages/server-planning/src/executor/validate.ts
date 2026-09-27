import {
  applyUnset, assertMutable, BODY_MAX, CODE_MAX, DESCRIPTION_MAX, IllegalTransition,
  LabelNotAllowed, MAX_LABELS, MAX_PARENTS, mergeFields, normalizeParents, ParentNotFound, PlanningError,
  RelationshipRefused, ruleOf, SpecificationRevisionConflict, SpecificationSlotUnknown, slotOf, TITLE_MAX,
  TransitionAction, validateFields, validateSpecificationBody, WorkcardKind,
} from '@owlmeans/planning'
import type {
  PlanningFacade, RelationshipDraft, Specification, TransitionExecution, WorkcardDraft,
} from '@owlmeans/planning'
import type { PlanningRuntime } from '../service.js'
import { assertChildAllowed } from './resolve.js'
import type { Resolved } from './resolve.js'

const ACTIONS = new Set<string>(Object.values(TransitionAction))

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

const assertFlow = (exec: TransitionExecution, resolved: Resolved, runtime: PlanningRuntime): void => {
  if (resolved.create) {
    const status = (exec.card as WorkcardDraft).status
    const primary = runtime.service().schemas.primaryFlow(resolved.type.type)
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
  if (ruleOf(resolved.flow, exec.transition!, from) == null) {
    throw new IllegalTransition(`${resolved.flowId}:${exec.transition}:${from}`)
  }
}

const assertFields = (exec: TransitionExecution, resolved: Resolved, runtime: PlanningRuntime): void => {
  const schemas = runtime.service().schemas
  if (resolved.create) {
    const draft = exec.card as WorkcardDraft
    validateFields(schemas, resolved.type.type, mergeFields(draft.fields, exec.changes?.fields))
    return
  }
  const clears = (exec.unset ?? []).filter(path => path.startsWith('fields.'))
  if (exec.changes?.fields == null && clears.length === 0) {
    return
  }
  const merged = applyUnset({ fields: mergeFields(resolved.card!.fields, exec.changes?.fields) }, clears)
  validateFields(schemas, resolved.type.type, merged.fields)
}

const assertLabels = (exec: TransitionExecution, resolved: Resolved): void => {
  const labels = [
    ...(resolved.create ? (exec.card as WorkcardDraft).labels ?? [] : []),
    ...(exec.changes?.labels ?? []),
  ]
  if (labels.length === 0) {
    return
  }
  if (new Set(labels).size > MAX_LABELS) {
    throw new LabelNotAllowed(`too-many:${labels.length}`)
  }
  const allowed = resolved.type.labels
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
  const moved = [...new Set(normalizeParents(changes.parent, changes.parents))]
    .filter(id => id !== resolved.card!.parent && !resolved.card!.parents.includes(id))
  for (const id of moved) {
    if (id === resolved.card!.id) {
      throw malformed('parent-self')
    }
    const found = await facade.cards.load(id)
    if (found == null) {
      throw new ParentNotFound(id)
    }
    assertChildAllowed(runtime, found, resolved.card!.kind, resolved.card!.type)
  }
}

const assertSpecification = async (
  exec: TransitionExecution, resolved: Resolved, runtime: PlanningRuntime, facade: PlanningFacade
): Promise<void> => {
  const kind = resolved.create ? (exec.card as WorkcardDraft).kind : resolved.card!.kind
  if (kind !== WorkcardKind.Specification) {
    return
  }
  const schemas = runtime.service().schemas

  if (resolved.create) {
    const draft = exec.card as WorkcardDraft
    const parent = resolved.parent!
    if (draft.category == null || draft.category === '') {
      throw malformed('specification-without-category')
    }
    const slot = slotOf(schemas.type(parent.type), draft.category)
    if (slot == null) {
      throw new SpecificationSlotUnknown(`${parent.type}:${draft.category}`)
    }
    if (draft.format != null && draft.format !== slot.format) {
      throw malformed(`format:${draft.category}:${draft.format}`)
    }
    assertText('body', draft.body, BODY_MAX, false)
    validateSpecificationBody(slot, draft.body)
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
    validateSpecificationBody(slot, changes.body)
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
    const target = await facade.cards.load(draft.to)
    if (target == null) {
      throw new RelationshipRefused(`to:${draft.to}`)
    }
    if (rule.from != null && !rule.from.includes(resolved.type.type)) {
      throw new RelationshipRefused(`from-type:${draft.type}:${resolved.type.type}`)
    }
    if (rule.to != null && !rule.to.includes(target.type)) {
      throw new RelationshipRefused(`to-type:${draft.type}:${target.type}`)
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

/**
 * Step 6: shape, flow rule, immutables, `fields`, labels, parent moves, the specification slot and
 * relationships — in that order. Nothing is written by a refusal here.
 *
 * @throws {PlanningError} `malformed:*` / `immutable:*`
 * @throws {IllegalTransition | FieldsInvalid | LabelNotAllowed | ParentNotFound | CardTypeNotAllowed}
 * @throws {SpecificationSlotUnknown | SpecificationRevisionConflict | RelationshipRefused}
 */
export const validateExecution = async (
  runtime: PlanningRuntime, facade: PlanningFacade, exec: TransitionExecution, resolved: Resolved
): Promise<void> => {
  assertShape(exec, resolved)
  assertFlow(exec, resolved, runtime)
  assertMutable(exec, resolved.type)
  assertFields(exec, resolved, runtime)
  assertLabels(exec, resolved)
  await assertParentMove(exec, resolved, runtime, facade)
  await assertSpecification(exec, resolved, runtime, facade)
  await assertRelationships(exec, resolved, facade)
}
