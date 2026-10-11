
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { applyHelper, PlanningError, PlanningUnsupported, WorkcardConflict, type ExecuteOptions, type PlanningExecContext, type PlanningFacade, type PlanningPlugin, type PlanningStore, type Transition, type TransitionExecution, type TransitionReceipt } from '@owlmeans/planning'
import { changesUtils } from './executor/changes.js'
import { codeUtils } from './executor/code.js'
import { creatorHelper } from './executor/creator.js'
import { makeReceipt } from './executor/receipt.js'
import type { Resolved } from './executor/types.js'
import { validateExecution } from './executor/validate.js'
import type { PlanningRuntime } from './types.js'
import { resolveUtilsOf } from './executor/resolve.js'
import { idHelper } from '@owlmeans/basic-ids'

export { assertCreatorFixed, createCreatorHelper, creatorHelper, creatorOf, withCreator } from './executor/creator.js'
export type * from './executor/creator/types.js'

const isoNow = (): string => new Date().toISOString()

/** What a type/parent change by a middleware is judged by. */
const identityOf = (exec: TransitionExecution): string => typeof exec.card === 'string'
  ? `${exec.action}|${exec.card}|${exec.flow ?? ''}|${exec.changes?.parent ?? ''}`
  : `${exec.action}|${exec.card.kind}|${exec.card.type}|${exec.card.parent ?? ''}|${(exec.card.parents ?? []).join(',')}|${exec.flow ?? ''}`

const execContextOf = (
  runtime: PlanningRuntime, facade: PlanningFacade, resolved: Resolved
) => (plugin: PlanningPlugin): PlanningExecContext => ({
  context: runtime.context() as BasicContext<BasicConfig>,
  scope: facade.scope,
  schemas: resolved.schemas,
  store: resolved.store,
  facade,
  plugin,
  type: resolved.type,
  flow: resolved.flow,
  ...(resolved.card != null ? { card: resolved.card } : {}),
  ...(resolved.parent != null ? { parent: resolved.parent } : {}),
})

const findByKey = async (
  runtime: PlanningRuntime, entityId: string, key: string
): Promise<{ store: PlanningStore, transition: Transition } | null> => {
  for (const store of runtime.stores()) {
    const transition = await store.transitions?.byKey(entityId, key)
    if (transition != null) {
      return { store, transition }
    }
  }
  return null
}

/** The receipt an update that changes nothing answers with: the card's latest transition. */
const currentReceipt = async (
  store: PlanningStore, resolved: Resolved, entityId: string, opts?: ExecuteOptions
): Promise<TransitionReceipt> => {
  const latest = await store.transitions!.list(
    { entityId, card: resolved.card!.id! }, { sort: [{ field: 'seq', order: 'desc' }], size: 1 }
  )
  const transition = latest.items[0]
  if (transition == null) {
    throw new PlanningUnsupported(`empty-update-without-log:${resolved.card!.id}`)
  }
  return await makeReceipt(store, transition, opts)
}

/**
 * THE write path. Nothing is appended before step 11, so every refusal leaves the log untouched.
 *
 * 1 normalize (a create's `createdBy` defaults to the scope's subject — `creatorHelper.withCreator`) →
 * 2 scope → 3 idempotency (a known `key` answers its first receipt, before any validation) →
 * 4 resolve → 5 the plugins' `before` chain (re-resolved once when it moved the type or the parent)
 * → 6 validate (a `createdBy` in `changes`/`unset` is refused — `creatorHelper.assertCreatorFixed`) →
 * 7 allocate the card id → 8 code → 9 changes (an update changing nothing answers
 * the current receipt and appends nothing) → 10 seq, a CAS against the head → 11 append →
 * 12 request the projection → 13 receipt → 14 `wait`.
 *
 * `after` hooks are NOT run here — the process that folds runs them, once per commit.
 */
export const executeTransition = async (
  runtime: PlanningRuntime, facade: PlanningFacade, input: TransitionExecution, opts?: ExecuteOptions
): Promise<TransitionReceipt> => {
  const scope = facade.scope
  const at = (runtime.options.now ?? isoNow)()
  const resolve = resolveUtilsOf(runtime)

  let exec = creatorHelper.withCreator(resolve.normalizeExecution(input), scope)

  if (scope.entityId == null || scope.entityId === '') {
    throw new PlanningError('malformed:scope-without-entity')
  }

  if (exec.key != null && exec.key !== '') {
    const found = await findByKey(runtime, scope.entityId, exec.key)
    if (found != null) {
      return await makeReceipt(found.store, found.transition, opts)
    }
  }

  let resolved = await resolve.resolveExecution(facade, exec)

  const before = identityOf(exec)
  exec = resolve.normalizeExecution(await runtime.registry.before(exec, execContextOf(runtime, facade, resolved)))
  if (identityOf(exec) !== before) {
    resolved = await resolve.resolveExecution(facade, exec)
  }

  await validateExecution(runtime, facade, exec, resolved)

  const store = resolved.store
  const transitions = store.transitions
  if (transitions == null) {
    throw new PlanningUnsupported(`transitions:${store.alias ?? resolved.type.type}`)
  }

  const cardId = resolved.create
    ? store.newId?.() ?? runtime.options.ids?.() ?? idHelper.uuid()
    : resolved.card!.id!

  exec = await codeUtils.assignCode(exec, resolved, scope, runtime.registry, execContextOf(runtime, facade, resolved))

  const { set, empty } = changesUtils.changeSetOf(exec, resolved, resolved.schemas, at)
  if (empty) {
    return await currentReceipt(store, resolved, scope.entityId, opts)
  }

  const preview = changesUtils.transitionOf({ exec, resolved, scope, set, cardId, seq: (resolved.card?.seq ?? 0) + 1, at, project: resolve.projectFor(resolved, exec, cardId) })
  await store.validateProjection?.(resolved.card ?? null, applyHelper.applyTransition(resolved.card, preview), preview)

  const seq = await transitions.nextSeq(cardId, resolved.create ? null : exec.expectSeq ?? null)
  if (resolved.create && seq !== 1) {
    throw new WorkcardConflict(`${cardId}:create:${seq}`)
  }

  const transition = changesUtils.transitionOf({
    exec, resolved, scope, set, cardId, seq, at,
    project: resolve.projectFor(resolved, exec, cardId),
  })

  let appended: Transition
  try {
    appended = await transitions.append(transition)
  } catch (error) {
    // A lost race on the idempotency key: the winner's receipt is the answer.
    if (exec.key != null && exec.key !== '') {
      const winner = await transitions.byKey(scope.entityId, exec.key)
      if (winner != null) {
        return await makeReceipt(store, winner, opts)
      }
    }
    throw error
  }

  await store.cards.project(cardId, appended.id != null ? { transition: appended.id } : undefined)

  return await makeReceipt(store, appended, opts)
}
