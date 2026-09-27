import { CommitState, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import type { CommitEvent, PlanningFacade, TransitionReceiptView, Workcard } from '@owlmeans/planning'
import { syncLinks } from './stores.js'
import type { PlanningStores } from './types.js'
import { dropCard, putCard, putCommit } from './utils/record.js'

/**
 * Fold one commit frame into the mirror.
 *
 * - An OLDER `seq` never overwrites a newer record — frames and list answers race.
 * - A committed `delete` REMOVES the row and every link touching it (and, for a project, the rows
 *   under it — the server purged them in the same fold).
 * - A frame for an id the store never saw still writes a row: a card created in another tab
 *   appears here without waiting for the next list.
 * - A `failed` commit leaves the card alone; the reason is recorded in the commit store.
 *
 * A frame from a cross-process bus carries ids only. When `record` is absent the card is re-read
 * through `facade`; without one there is nothing to write but the commit itself.
 */
export const applyCommitEvent = async (
  stores: PlanningStores, event: CommitEvent, facade?: PlanningFacade
): Promise<void> => {
  const known = await stores.cards.load(event.card)

  await putCommit(stores.commits, {
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
    await dropCard(stores, event.card, event.kind === WorkcardKind.Project)
    return
  }

  const record: Workcard | null | undefined = event.record !== undefined
    ? event.record
    : facade != null ? await facade.cards.load(event.card) : undefined

  if (record === null) {
    // Committed, and gone by the time it was read: a later delete won the race.
    await dropCard(stores, event.card, event.kind === WorkcardKind.Project)
  } else if (record !== undefined) {
    await putCard(stores.cards, record)
  }

  if (facade != null && (event.action === TransitionAction.Link || event.action === TransitionAction.Unlink)) {
    const links = await facade.relationships.list({ from: event.card, size: 0 })
    await syncLinks(stores.links, links.items, { from: event.card })
  }
}

/**
 * Mark a receipt in the mirror the moment the server answers it.
 *
 * A pending transition raises the card's `head` to its `seq`, so `head > seq` — the model's
 * `pending()` — is true before any frame arrives. A receipt that already carries the committed
 * card writes it; a committed delete drops the row.
 */
export const applyReceipt = async (stores: PlanningStores, receipt: TransitionReceiptView): Promise<void> => {
  const { transition } = receipt
  if (transition.id != null) {
    await putCommit(stores.commits, {
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
    await dropCard(stores, transition.card, transition.kind === WorkcardKind.Project)
    return
  }
  if (receipt.card != null) {
    await putCard(stores.cards, receipt.card)
    return
  }

  const known = await stores.cards.load(transition.card)
  if (known != null && (known.head ?? known.seq) < transition.seq) {
    await stores.cards.save({ ...known, head: transition.seq })
  }
}

/** Write cards the caller read on its own, under the same newer-fold-wins rule as a commit. */
export const applyCards = async (stores: Pick<PlanningStores, 'cards'>, cards: Workcard[]): Promise<void> => {
  for (const card of cards) {
    await putCard(stores.cards, card)
  }
}
