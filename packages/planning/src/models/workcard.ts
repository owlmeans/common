import { IntrinsicStatus, TransitionAction, WorkcardKind } from '../consts.js'
import { PlanningError } from '../errors.js'
import { isPending } from '../helpers/card.js'
import { slotOf, specificationTypeOf } from '../helpers/specification.js'
import {
  canTransit, initialStatusOf, intrinsicOf, primaryFlowOf, transitionsFrom,
} from '../helpers/status.js'
import type {
  ExecuteOptions, ModelExecuteOptions, PlanningFacade, TransitionExecution, TransitionReceipt,
  Workcard, WorkcardModel,
} from '../types.js'

/**
 * Run an execution with a model's defaults: `expectSeq` is the record's head (its seq when nothing
 * is in flight) unless the caller names one — `null` opts out.
 */
export const executeFor = (
  facade: PlanningFacade, record: Pick<Workcard, 'seq' | 'head'> | null, exec: TransitionExecution,
  opts?: ModelExecuteOptions
): Promise<TransitionReceipt> => {
  const { wait, timeout, actor, cause, key, expectSeq } = opts ?? {}
  const options: ExecuteOptions = Object.fromEntries(Object.entries({ wait, timeout })
    .filter(([, value]) => value !== undefined))

  return facade.execute(Object.fromEntries(Object.entries({
    ...exec,
    actor,
    cause,
    key,
    expectSeq: expectSeq !== undefined ? expectSeq : record == null ? undefined : record.head ?? record.seq,
  }).filter(([, value]) => value !== undefined)) as unknown as TransitionExecution, options)
}

/**
 * The same object on a server and in a browser: reads answer from the schema registry with no I/O,
 * writes build a {@link TransitionExecution} and hand it to the facade.
 *
 * @throws {PlanningError} `malformed:model-without-id` for a record that was never stored
 */
export const makeWorkcardModel = <T extends Workcard = Workcard>(record: T, facade: PlanningFacade): WorkcardModel<T> => {
  if (record.id == null) {
    throw new PlanningError('malformed:model-without-id')
  }
  const id = record.id
  const run = (exec: Omit<TransitionExecution, 'card'>, opts?: ModelExecuteOptions) =>
    executeFor(facade, record, { ...exec, card: id }, opts)

  const model: WorkcardModel<T> = {
    record,
    id,
    kind: record.kind,
    type: record.type,

    schema: () => facade.schemas.type(record.type),

    flow: flowId => facade.schemas.flow(flowId ?? primaryFlowOf(model.schema())),

    statusOf: flowId => {
      const primary = primaryFlowOf(model.schema())
      if (flowId == null || flowId === primary) {
        return record.status
      }
      return record.flows[flowId] ?? initialStatusOf(model.flow(flowId))
    },

    intrinsicOf: flowId => flowId == null
      ? record.intrinsic
      : intrinsicOf(model.flow(flowId), model.statusOf(flowId)) ?? IntrinsicStatus.Planned,

    can: (transition, flowId) => canTransit(model.flow(flowId), transition, model.statusOf(flowId)),

    available: flowId => transitionsFrom(model.flow(flowId), model.statusOf(flowId)),

    pending: () => isPending(record),

    transit: (transition, changes, opts) => run({
      action: TransitionAction.Transit, transition, flow: opts?.flow, changes,
    }, opts),

    update: (changes, opts) => run({ action: TransitionAction.Update, changes, unset: opts?.unset }, opts),

    remove: opts => run({ action: TransitionAction.Delete }, opts),

    link: (type, to, fields, opts) => run({
      action: TransitionAction.Link, link: { type, from: id, to, ...(fields != null ? { fields } : {}) },
    }, opts),

    unlink: (type, to, opts) => run({ action: TransitionAction.Unlink, link: { type, from: id, to } }, opts),

    children: query => facade.cards.list({ ...query, parent: id }),

    relationships: query => facade.relationships.list({ ...query, from: query?.from ?? id }),

    transitions: query => facade.transitions.list({ ...query, card: id }),

    specification: category => facade.specifications.current(id, category),

    specifications: query => facade.specifications.list(id, query),

    revisions: async (category, limit) => {
      const current = await facade.specifications.current(id, category)
      return current?.id == null ? [] : facade.specifications.revisions(current.id, limit)
    },

    write: async (category, body, opts) => {
      const current = await facade.specifications.current(id, category)
      if (current?.id != null) {
        return executeFor(facade, current, {
          card: current.id,
          action: TransitionAction.Update,
          changes: Object.fromEntries(Object.entries({
            body, format: opts?.format, version: opts?.version, ref: opts?.ref,
          }).filter(([, value]) => value !== undefined)),
        }, opts)
      }

      const slot = slotOf(model.schema(), category)
      return executeFor(facade, null, {
        card: Object.fromEntries(Object.entries({
          kind: WorkcardKind.Specification,
          type: opts?.type ?? specificationTypeOf(facade.schemas, record.type, slot),
          parent: id,
          title: opts?.title ?? category,
          category,
          format: opts?.format ?? slot?.format,
          body,
          ref: opts?.ref,
          version: opts?.version ?? slot?.version,
        }).filter(([, value]) => value !== undefined)) as unknown as TransitionExecution['card'],
        action: TransitionAction.Create,
      }, opts)
    },

    reload: async () => makeWorkcardModel(await facade.cards.get(id) as T, facade),
  }

  return model
}
