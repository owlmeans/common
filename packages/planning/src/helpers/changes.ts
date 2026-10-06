import { IntrinsicStatus, SpecificationFormat, TransitionAction, WorkcardKind } from '../consts.js'
import { IllegalTransition, PlanningError } from '../errors.js'
import type { AnyTypeSchema, Specification, SpecificationSlot, TransitionExecution, Workcard, WorkcardChanges, WorkcardDraft } from '../types.js'
import { cardHelper } from './card.js'
import type { ChangeSet, ChangesHelper } from './changes/types.js'
import { CONTENT_KEYS, DERIVED_KEYS, FLOW_KEYS, IDENTITY_KEYS, PROVENANCE_KEYS, REQUIRED_KEYS } from './changes/consts.local.js'
import { specificationHelper } from './specification.js'
import { statusHelper } from './status.js'
import type { FlowLookup } from './types.local.js'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

export const createChangesHelper = (): ChangesHelper => {
  const sameValue = (left: unknown, right: unknown): boolean => {
    if (left === right) {
      return true
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every((entry, index) => sameValue(entry, right[index]))
    }
    if (isPlainObject(left) && isPlainObject(right)) {
      const keys = Object.keys(left).filter(key => left[key] !== undefined)
      const other = Object.keys(right).filter(key => right[key] !== undefined)
      return keys.length === other.length && keys.every(key => sameValue(left[key], right[key]))
    }

    return false
  }

  const mergeFields = (
    base?: Record<string, unknown> | null, patch?: Record<string, unknown> | null
  ): Record<string, unknown> => Object.fromEntries(Object.entries({ ...(base ?? {}), ...(patch ?? {}) })
    .filter(([, value]) => value !== null && value !== undefined))

  const applyUnset = <T extends object>(record: T, unset?: string[]): T => {
    const copy = structuredClone(record) as Record<string, unknown>
    for (const path of unset ?? []) {
      const [head, ...rest] = path.split('.')
      if (rest.length > 0) {
        const map = copy[head]
        if (isPlainObject(map)) {
          delete map[rest.join('.')]
        }
      } else {
        delete copy[head]
      }
    }

    return copy as T
  }

  const assertMutable = (exec: TransitionExecution, type: AnyTypeSchema): void => {
    const create = exec.action === TransitionAction.Create
    const codeFixed = type.code != null && type.code.mutable !== true
    const refuse = (key: string): never => {
      throw new PlanningError(`immutable:${FLOW_KEYS.includes(key) ? 'status' : key}`)
    }

    for (const [key, value] of Object.entries(exec.changes ?? {})) {
      if (value === undefined) {
        continue
      }
      if (IDENTITY_KEYS.includes(key) || PROVENANCE_KEYS.includes(key) || DERIVED_KEYS.includes(key)) {
        refuse(key)
      }
      if (!create && (FLOW_KEYS.includes(key) || key === 'category' || (key === 'code' && codeFixed))) {
        refuse(key)
      }
    }

    for (const path of exec.unset ?? []) {
      const head = path.split('.')[0]
      if (PROVENANCE_KEYS.includes(head)) {
        refuse(head)
      }
      if (IDENTITY_KEYS.includes(path) || DERIVED_KEYS.includes(path) || REQUIRED_KEYS.includes(path)
        || FLOW_KEYS.includes(head) || (path === 'code' && codeFixed)) {
        refuse(path)
      }
    }
  }

  const reach = (record: Record<string, unknown>, path: string): unknown => path.split('.')
    .reduce<unknown>((value, step) => isPlainObject(value) ? value[step] : undefined, record)

  /** Only what differs from the card; `null` becomes an unset of a field that has a value. */
  const diffInto = (card: Workcard, changes: WorkcardChanges | undefined, skip: string[], set: ChangeSet): void => {
    const out = set.changes as Record<string, unknown>
    const current = card as unknown as Record<string, unknown>

    for (const [key, value] of Object.entries(changes ?? {})) {
      if (value === undefined || IDENTITY_KEYS.includes(key) || PROVENANCE_KEYS.includes(key) || skip.includes(key)) {
        continue
      }
      if (key === 'fields' || key === 'flows') {
        const own = (current[key] ?? {}) as Record<string, unknown>
        const patch: Record<string, unknown> = {}
        for (const [entry, entryValue] of Object.entries(value as Record<string, unknown> ?? {})) {
          if (entryValue === undefined) {
            continue
          }
          if (entryValue === null) {
            if (own[entry] !== undefined) {
              set.unset.push(`${key}.${entry}`)
            }
          } else if (!sameValue(own[entry], entryValue)) {
            patch[entry] = entryValue
          }
        }
        if (Object.keys(patch).length > 0) {
          out[key] = patch
        }
        continue
      }
      if (value === null) {
        if (current[key] != null) {
          set.unset.push(key)
        }
        continue
      }
      if (!sameValue(current[key], value)) {
        out[key] = value
      }
    }
  }

  const unsetInto = (card: Workcard, unset: string[] | undefined, set: ChangeSet): void => {
    for (const path of unset ?? []) {
      if (PROVENANCE_KEYS.includes(path.split('.')[0])) {
        continue
      }
      if (reach(card as unknown as Record<string, unknown>, path) !== undefined && !set.unset.includes(path)) {
        set.unset.push(path)
      }
    }
  }

  /** A moved primary parent replaces the old one in `parents`. */
  const reparent = (card: Workcard, set: ChangeSet): void => {
    const out = set.changes
    const moved = out.parent !== undefined || set.unset.includes('parent')
    if (!moved || out.parents !== undefined) {
      return
    }
    const parents = cardHelper.normalizeParents(out.parent, card.parents.filter(parent => parent !== card.parent))
    if (!sameValue(parents, card.parents)) {
      out.parents = parents
    }
  }

  const reviseInto = (card: Workcard, slot: SpecificationSlot | null | undefined, set: ChangeSet): void => {
    if (card.kind !== WorkcardKind.Specification) {
      return
    }
    const out = set.changes
    if (out.body !== undefined) {
      out.bodyChars = specificationHelper.bodyCharsOf(out.body)
    } else if (set.unset.includes('body') && !set.unset.includes('bodyChars')) {
      set.unset.push('bodyChars')
    }
    const revised = CONTENT_KEYS.some(key => (out as Record<string, unknown>)[key] !== undefined || set.unset.includes(key))
    if (revised) {
      const revision = specificationHelper.nextRevision(card as Specification, slot)
      if (revision != null) {
        out.revision = revision
      }
    }
  }

  const createOf = (
    exec: TransitionExecution, type: AnyTypeSchema, registry: FlowLookup, at: string, slot?: SpecificationSlot | null
  ): ChangeSet => {
    if (typeof exec.card === 'string') {
      throw new PlanningError('malformed:create-without-draft')
    }
    const draft: WorkcardDraft = exec.card
    const overlay = Object.fromEntries(Object.entries(exec.changes ?? {})
      .filter(([key]) => !FLOW_KEYS.includes(key) && !IDENTITY_KEYS.includes(key) && !PROVENANCE_KEYS.includes(key)
        && !DERIVED_KEYS.includes(key))
    ) as WorkcardChanges

    const parent = overlay.parent ?? draft.parent
    const flows = statusHelper.initialFlowsOf(type, registry, draft.status ?? exec.changes?.status)
    const intrinsic = statusHelper.resolveIntrinsic(type, flows, registry)

    const record: Record<string, unknown> = {
      title: draft.title,
      description: draft.description,
      code: draft.code,
      order: draft.order,
      createdBy: draft.createdBy,
      ...overlay,
      labels: [...new Set(overlay.labels ?? draft.labels ?? [])],
      parent,
      parents: cardHelper.normalizeParents(parent, overlay.parents ?? draft.parents),
      fields: mergeFields(draft.fields, overlay.fields),
      flows,
      status: flows[statusHelper.primaryFlowOf(type)],
      intrinsic,
      closedAt: intrinsic === IntrinsicStatus.Closed ? at : undefined,
    }

    if (draft.kind === WorkcardKind.Specification) {
      const body = overlay.body ?? draft.body
      Object.assign(record, {
        category: overlay.category ?? draft.category ?? slot?.category,
        format: overlay.format ?? draft.format ?? slot?.format ?? SpecificationFormat.Markdown,
        body,
        ref: overlay.ref ?? draft.ref,
        version: overlay.version ?? draft.version ?? slot?.version,
        bodyChars: specificationHelper.bodyCharsOf(body),
        revision: specificationHelper.nextRevision(null, slot),
      })
    }

    return { changes: clean(record) as WorkcardChanges, unset: [] }
  }

  const computeChanges = (
    card: Workcard | null | undefined,
    exec: TransitionExecution,
    type: AnyTypeSchema,
    registry: FlowLookup,
    at: string,
    opts?: { slot?: SpecificationSlot | null }
  ): ChangeSet => {
    if (exec.action === TransitionAction.Create) {
      return createOf(exec, type, registry, at, opts?.slot)
    }
    const set: ChangeSet = { changes: {}, unset: [] }
    if (exec.action !== TransitionAction.Update && exec.action !== TransitionAction.Transit) {
      return set
    }
    if (card == null) {
      throw new PlanningError(`malformed:${exec.action}-without-card`)
    }

    if (exec.action === TransitionAction.Update) {
      diffInto(card, exec.changes, [], set)
      unsetInto(card, exec.unset, set)
      reparent(card, set)
      reviseInto(card, opts?.slot, set)

      return set
    }

    if (exec.transition == null) {
      throw new PlanningError('malformed:transit-without-transition')
    }
    const primary = statusHelper.primaryFlowOf(type)
    const flowId = exec.flow ?? primary
    const flow = registry.flow(flowId)
    const from = card.flows[flowId] ?? (flowId === primary ? card.status : statusHelper.initialStatusOf(flow))
    const rule = statusHelper.ruleOf(flow, exec.transition, from)
    if (rule == null) {
      throw new IllegalTransition(`${flowId}:${exec.transition}:${from}`)
    }

    diffInto(card, exec.changes, FLOW_KEYS, set)
    unsetInto(card, exec.unset?.filter(path => !FLOW_KEYS.includes(path.split('.')[0])), set)
    reparent(card, set)
    reviseInto(card, opts?.slot, set)

    const flows = { ...card.flows, [flowId]: rule.to }
    set.changes.flows = { [flowId]: rule.to }
    if (flowId === primary) {
      set.changes.status = rule.to
    }
    const intrinsic = statusHelper.resolveIntrinsic(type, flows, registry)
    if (intrinsic !== card.intrinsic) {
      set.changes.intrinsic = intrinsic
    }
    if (intrinsic === IntrinsicStatus.Closed && card.intrinsic !== IntrinsicStatus.Closed) {
      set.changes.closedAt = at
    } else if (intrinsic !== IntrinsicStatus.Closed && card.closedAt != null) {
      set.unset.push('closedAt')
    }

    return { ...set, flow: flowId, from, to: rule.to }
  }

  const isEmptyChange = (set: Pick<ChangeSet, 'changes' | 'unset'>): boolean =>
    set.unset.length === 0 && Object.entries(set.changes).every(([, value]) =>
      value === undefined || (isPlainObject(value) && Object.keys(value).length === 0))

  return { sameValue, mergeFields, applyUnset, assertMutable, computeChanges, isEmptyChange }
}

export const changesHelper = createChangesHelper()

/** @deprecated compat:factory-refactor — use `changesHelper.sameValue(…)` */
export const sameValue = (left: unknown, right: unknown): boolean => changesHelper.sameValue(left, right)

/** @deprecated compat:factory-refactor — use `changesHelper.mergeFields(…)` */
export const mergeFields = (
  base?: Record<string, unknown> | null, patch?: Record<string, unknown> | null
): Record<string, unknown> => changesHelper.mergeFields(base, patch)

/** @deprecated compat:factory-refactor — use `changesHelper.applyUnset(…)` */
export const applyUnset = <T extends object>(record: T, unset?: string[]): T => changesHelper.applyUnset<T>(record, unset)

/** @deprecated compat:factory-refactor — use `changesHelper.assertMutable(…)` */
export const assertMutable = (exec: TransitionExecution, type: AnyTypeSchema): void => changesHelper.assertMutable(exec, type)

/** @deprecated compat:factory-refactor — use `changesHelper.computeChanges(…)` */
export const computeChanges = (
  card: Workcard | null | undefined,
  exec: TransitionExecution,
  type: AnyTypeSchema,
  registry: FlowLookup,
  at: string,
  opts?: { slot?: SpecificationSlot | null }
): ChangeSet => changesHelper.computeChanges(card, exec, type, registry, at, opts)

/** @deprecated compat:factory-refactor — use `changesHelper.isEmptyChange(…)` */
export const isEmptyChange = (set: Pick<ChangeSet, 'changes' | 'unset'>): boolean => changesHelper.isEmptyChange(set)
