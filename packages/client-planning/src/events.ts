import { memoHelper } from '@owlmeans/context'
import { CommitState, TransitionAction, WorkcardKind, type CommitEvent, type PlanningFacade, type TransitionReceiptView, type Workcard } from '@owlmeans/planning'
import type { PlanningMirror } from './events/types.js'
import { syncHelper } from './sync.js'
import type { PlanningStores } from './types.js'
import { recordUtils } from './utils/record.js'

export const makePlanningMirror = (stores: PlanningStores): PlanningMirror => {
  const applyCommitEvent = async (event: CommitEvent, facade?: PlanningFacade): Promise<void> => {
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

    const record: Workcard | null | undefined = event.record !== undefined
      ? event.record
      : facade != null ? await facade.cards.load(event.card) : undefined

    if (record === null) {
      // Committed, and gone by the time it was read: a later delete won the race.
      await recordUtils.dropCard(stores, event.card, event.kind === WorkcardKind.Project)
    } else if (record !== undefined) {
      await recordUtils.putCard(stores.cards, record)
    }

    if (facade != null && (event.action === TransitionAction.Link || event.action === TransitionAction.Unlink)) {
      const links = await facade.relationships.list({ from: event.card, size: 0 })
      await syncHelper.syncLinks(stores.links, links.items, { from: event.card })
    }
  }

  const applyReceipt = async (receipt: TransitionReceiptView): Promise<void> => {
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
  }

  const applyCards = async (cards: Workcard[]): Promise<void> => {
    for (const card of cards) {
      await recordUtils.putCard(stores.cards, card)
    }
  }

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
