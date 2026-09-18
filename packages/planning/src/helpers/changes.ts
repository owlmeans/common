import { IntrinsicStatus, SpecificationFormat, TransitionAction, WorkcardKind } from '../consts.js'
import { IllegalTransition, PlanningError } from '../errors.js'
import type {
  AnyTypeSchema, PlanningSchemaRegistry, Specification, SpecificationSlot, TransitionExecution,
  Workcard, WorkcardChanges, WorkcardDraft,
} from '../types.js'
import { normalizeParents } from './card.js'
import { bodyCharsOf, nextRevision } from './specification.js'
import { initialFlowsOf, initialStatusOf, primaryFlowOf, resolveIntrinsic, ruleOf } from './status.js'

type FlowLookup = Pick<PlanningSchemaRegistry, 'flow'>

export interface ChangeSet {
  changes: WorkcardChanges
  unset: string[]
  /** Transit only: the flow that moved, and the move. */
  flow?: string
  from?: string
  to?: string
}

/** Never in a caller's changes: the transition itself carries them. */
const IDENTITY_KEYS = ['id', 'kind', 'type', 'entityId', 'seq', 'head', 'createdAt']
/** Move only through `transit` (or a create's draft). */
const FLOW_KEYS = ['status', 'intrinsic', 'flows', 'closedAt']
/** Computed by the executor, never supplied. */
const DERIVED_KEYS = ['revision', 'bodyChars']
/** Cannot be cleared. */
const REQUIRED_KEYS = ['title', 'parents', 'labels', 'fields', 'category', 'format']
/** Changing one of these produces a new revision of a revisioned document. */
const CONTENT_KEYS = ['body', 'ref', 'format', 'version']

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

/** Structural equality over JSON values. */
export const sameValue = (left: unknown, right: unknown): boolean => {
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

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

/** A shallow merge that drops keys patched to `null`. */
export const mergeFields = (
  base?: Record<string, unknown> | null, patch?: Record<string, unknown> | null
): Record<string, unknown> => Object.fromEntries(Object.entries({ ...(base ?? {}), ...(patch ?? {}) })
  .filter(([, value]) => value !== null && value !== undefined))

/** A copy of the record with the paths (`key`, `fields.key`, `flows.id`) removed. */
export const applyUnset = <T extends object>(record: T, unset?: string[]): T => {
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

/**
 * Refuse an execution that writes what only the transition, the flow or the executor may write.
 *
 * `status`/`intrinsic`/`flows`/`closedAt` move only through `transit` (a create's draft may name
 * the initial status); `code` is fixed once minted unless the type's policy says `mutable`;
 * `category` is fixed; `revision`/`bodyChars` are computed.
 *
 * @throws {PlanningError} `planning:immutable:<field>`
 */
export const assertMutable = (exec: TransitionExecution, type: AnyTypeSchema): void => {
  const create = exec.action === TransitionAction.Create
  const codeFixed = type.code != null && type.code.mutable !== true
  const refuse = (key: string): never => {
    throw new PlanningError(`immutable:${FLOW_KEYS.includes(key) ? 'status' : key}`)
  }

  for (const [key, value] of Object.entries(exec.changes ?? {})) {
    if (value === undefined) {
      continue
    }
    if (IDENTITY_KEYS.includes(key) || DERIVED_KEYS.includes(key)) {
      refuse(key)
    }
    if (!create && (FLOW_KEYS.includes(key) || key === 'category' || (key === 'code' && codeFixed))) {
      refuse(key)
    }
  }

  for (const path of exec.unset ?? []) {
    const head = path.split('.')[0]
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
    if (value === undefined || IDENTITY_KEYS.includes(key) || skip.includes(key)) {
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
  const parents = normalizeParents(out.parent, card.parents.filter(parent => parent !== card.parent))
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
    out.bodyChars = bodyCharsOf(out.body)
  } else if (set.unset.includes('body') && !set.unset.includes('bodyChars')) {
    set.unset.push('bodyChars')
  }
  const revised = CONTENT_KEYS.some(key => (out as Record<string, unknown>)[key] !== undefined || set.unset.includes(key))
  if (revised) {
    const revision = nextRevision(card as Specification, slot)
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
    .filter(([key]) => !FLOW_KEYS.includes(key) && !IDENTITY_KEYS.includes(key) && !DERIVED_KEYS.includes(key))
  ) as WorkcardChanges

  const parent = overlay.parent ?? draft.parent
  const flows = initialFlowsOf(type, registry, draft.status ?? exec.changes?.status)
  const intrinsic = resolveIntrinsic(type, flows, registry)

  const record: Record<string, unknown> = {
    title: draft.title,
    description: draft.description,
    code: draft.code,
    order: draft.order,
    createdBy: draft.createdBy,
    ...overlay,
    labels: [...new Set(overlay.labels ?? draft.labels ?? [])],
    parent,
    parents: normalizeParents(parent, overlay.parents ?? draft.parents),
    fields: mergeFields(draft.fields, overlay.fields),
    flows,
    status: flows[primaryFlowOf(type)],
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
      bodyChars: bodyCharsOf(body),
      revision: nextRevision(null, slot),
    })
  }

  return { changes: clean(record) as WorkcardChanges, unset: [] }
}

/**
 * The `changes`/`unset` a transition records (plan step 9).
 *
 * - `create`: the whole initial record from the draft (overlaid by `exec.changes`) — `parents`
 *   normalized, every flow at its initial status (the draft's `status` for the primary one),
 *   `status`/`intrinsic` mirrored, `closedAt` when it starts closed; a specification gets its
 *   format, `bodyChars` and revision 1 when the slot is revisioned.
 * - `update`: only what differs; `null` or `exec.unset` clears a field that has a value; a moved
 *   `parent` replaces the old one in `parents`; a revisioned document whose content changed gets
 *   `revision + 1`. An update that changes nothing is empty ({@link isEmptyChange}).
 * - `transit`: `flows[flow] = rule.to`, `status` when the flow is primary, `intrinsic` when it
 *   moves, `closedAt` set on entering closed and cleared on leaving it — plus the caller's own
 *   changes, diffed as in an update.
 * - `link`, `unlink`, `delete`: nothing.
 *
 * @throws {IllegalTransition} a transit the flow does not offer from the current status
 * @throws {PlanningError} `malformed:*` for an execution missing what its action needs
 */
export const computeChanges = (
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
  const primary = primaryFlowOf(type)
  const flowId = exec.flow ?? primary
  const flow = registry.flow(flowId)
  const from = card.flows[flowId] ?? (flowId === primary ? card.status : initialStatusOf(flow))
  const rule = ruleOf(flow, exec.transition, from)
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
  const intrinsic = resolveIntrinsic(type, flows, registry)
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

/** Nothing to write: no changed value and nothing to clear. */
export const isEmptyChange = (set: Pick<ChangeSet, 'changes' | 'unset'>): boolean =>
  set.unset.length === 0 && Object.entries(set.changes).every(([, value]) =>
    value === undefined || (isPlainObject(value) && Object.keys(value).length === 0))
