import { CommitState, DEFAULT_COMMIT_TIMEOUT, TransitionAction } from '@owlmeans/planning'
import type {
  CommitStatus, ExecuteOptions, PlanningStore, Transition, TransitionReceipt, TransitionReceiptView, Workcard,
} from '@owlmeans/planning'

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

const statusOf = async (store: PlanningStore, transition: Transition): Promise<CommitStatus | null> => {
  if (store.commits == null || transition.id == null) {
    return null
  }
  try {
    return await store.commits.status(transition.id)
  } catch {
    return null
  }
}

/** The transition as its latest commit status reports it, and the card when that commit landed. */
const viewOf = async (store: PlanningStore, transition: Transition): Promise<TransitionReceiptView> => {
  const status = await statusOf(store, transition)
  if (status == null) {
    return { transition }
  }
  const view: TransitionReceiptView = {
    transition: { ...transition, commit: clean({ state: status.state, at: status.at, error: status.error }) },
  }
  if (status.state === CommitState.Committed) {
    view.card = status.card !== undefined
      ? status.card
      : transition.action === TransitionAction.Delete
        ? null
        : await store.cards.get(transition.card, transition.entityId)
  }
  return view
}

/**
 * A receipt for an appended (or idempotently found) transition.
 *
 * `committed()` waits on the store's commit source; a store without one (a foreign provider that
 * applies writes itself) answers the card as it reads now. With `wait: true` the receipt is
 * returned only once the commit landed — `CommitFailed` / `CommitTimeout` otherwise.
 *
 * @throws {CommitFailed | CommitTimeout} in wait mode
 */
export const makeReceipt = async (
  store: PlanningStore, transition: Transition, opts?: ExecuteOptions
): Promise<TransitionReceipt> => {
  const committed = async (waitOpts?: { timeout?: number }): Promise<Workcard | null> => {
    if (store.commits == null || transition.id == null) {
      return await store.cards.get(transition.card, transition.entityId)
    }
    return await store.commits.wait(transition.id, { timeout: waitOpts?.timeout ?? DEFAULT_COMMIT_TIMEOUT })
  }

  let view = await viewOf(store, transition)
  if (opts?.wait === true && view.transition.commit.state !== CommitState.Committed) {
    const card = await committed({ timeout: opts.timeout })
    view = await viewOf(store, transition)
    view.card = card
  }

  return { ...view, committed }
}
