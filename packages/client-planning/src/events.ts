import { memoHelper } from '@owlmeans/context'
import { CommitState, TransitionAction, WorkcardKind, type CommitEvent, type PlanningFacade, type TransitionReceiptView, type Workcard } from '@owlmeans/planning'
import type { PlanningMirror, PlanningMirrorOptions } from './events/types.js'
import { syncHelper } from './sync.js'
import type { PlanningStores } from './types.js'
import { recordUtils } from './utils/record.js'

export const makePlanningMirror = (stores: PlanningStores): PlanningMirror => {
  const local = async (options: PlanningMirrorOptions | undefined, work: () => Promise<void>): Promise<void> =>
    options == null ? await work() : await options.lifecycle.mutate(options.operation, work)
  const read = async <T>(options: PlanningMirrorOptions | undefined, pending: Promise<T>): Promise<T> =>
    options == null ? await pending : await options.operation.wait(pending)
  const applyCommitEvent = async (event: CommitEvent, facade?: PlanningFacade, options?: PlanningMirrorOptions): Promise<void> => {
    options?.operation.check()
    // Resolve network references before entering the local mutation queue. Close must never
    // wait for a lost card/link read, and sequence comparisons happen against the latest mirror.
    const settled = event.state === CommitState.Committed && event.action !== TransitionAction.Delete
    const record = event.record !== undefined ? event.record
      : settled && facade != null ? await read(options, facade.cards.load(event.card)) : undefined
    const links = settled && facade != null && (event.action === TransitionAction.Link || event.action === TransitionAction.Unlink)
      ? await read(options, facade.relationships.list({ from: event.card, size: 0 })) : undefined
    await local(options, async () => {
      const known = await stores.cards.load(event.card)

      await recordUtils.putCommit(stores.commits, {
        id: event.transition,
        card: event.card,
        entityId: event.entityId,
        project: event.project,
        kind: event.kind,
        type: event.type,
        seq: event.seq,
        action: event.action,
        state: event.state,
        at: event.at,
        error: event.error,
      })

      if (event.state === CommitState.Failed) {
        return
      }
      if (event.state === CommitState.Pending) {
        if (known != null && (known.head ?? known.seq) < event.seq) {
          await stores.cards.save({ ...known, head: event.seq })
        }
        return
      }
      if (known != null && known.seq > event.seq) {
        return
      }

      if (event.action === TransitionAction.Delete) {
        await recordUtils.dropCard(stores, event.card, event.kind === WorkcardKind.Project)
        return
      }

      if (record === null) {
        // Committed, and gone by the time it was read: a later delete won the race.
        await recordUtils.dropCard(stores, event.card, event.kind === WorkcardKind.Project)
      } else if (record !== undefined) {
        await recordUtils.putCard(stores.cards, record)
      }

      if (links != null) {
        await syncHelper.syncLinks(stores.links, links.items, { from: event.card })
      }
    })
  }

  const applyReceipt = async (receipt: TransitionReceiptView, options?: PlanningMirrorOptions): Promise<void> => local(options, async () => {
    const { transition } = receipt
    if (transition.id != null) {
      await recordUtils.putCommit(stores.commits, {
        id: transition.id,
        card: transition.card,
        entityId: transition.entityId,
        project: transition.project,
        kind: transition.kind,
        type: transition.type,
        seq: transition.seq,
        action: transition.action,
        state: transition.commit.state,
        at: transition.commit.at,
        error: transition.commit.error,
      })
    }
    if (transition.commit.state === CommitState.Failed) {
      return
    }
    if (transition.commit.state === CommitState.Committed && transition.action === TransitionAction.Delete) {
      await recordUtils.dropCard(stores, transition.card, transition.kind === WorkcardKind.Project)
      return
    }
    if (receipt.card != null) {
      await recordUtils.putCard(stores.cards, receipt.card)
      return
    }

    const known = await stores.cards.load(transition.card)
    if (known != null && (known.head ?? known.seq) < transition.seq) {
      await stores.cards.save({ ...known, head: transition.seq })
    }
  })

  const applyCards = async (cards: Workcard[], options?: PlanningMirrorOptions): Promise<void> => local(options, async () => {
    for (const card of cards) {
      await recordUtils.putCard(stores.cards, card)
    }
  })

  return { applyCommitEvent, applyReceipt, applyCards }
}

/** The mirror of one set of stores — one per stores object. */
export const planningMirrorOf = memoHelper.oncePer(makePlanningMirror)

/** @deprecated compat:factory-refactor — use `planningMirrorOf(stores).applyCommitEvent(…)` */
export const applyCommitEvent = async (
  stores: PlanningStores, event: CommitEvent, facade?: PlanningFacade
): Promise<void> => await planningMirrorOf(stores).applyCommitEvent(event, facade)

/** @deprecated compat:factory-refactor — use `planningMirrorOf(stores).applyReceipt(…)` */
export const applyReceipt = async (stores: PlanningStores, receipt: TransitionReceiptView): Promise<void> =>
  await planningMirrorOf(stores).applyReceipt(receipt)

/**
 * @deprecated compat:factory-refactor — use `planningMirrorOf(stores).applyCards(…)`. Only `cards` is
 * read, so a narrower stores object still works here.
 */
export const applyCards = async (stores: Pick<PlanningStores, 'cards'>, cards: Workcard[]): Promise<void> =>
  await planningMirrorOf(stores as PlanningStores).applyCards(cards)
