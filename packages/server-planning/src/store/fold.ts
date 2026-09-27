import {
  applyRelationship, applyTransition, CommitState, isProject, PlanningUnsupported, TransitionAction,
} from '@owlmeans/planning'
import type {
  CommitEvent, PlanningStore, Relationship, SpecificationRevision, Transition, Workcard,
} from '@owlmeans/planning'
import type { FoldOptions, FoldResult } from './types.js'

const isoNow = (): string => new Date().toISOString()

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : `${error}`

const safely = async (label: string, run: () => Promise<void> | void | undefined): Promise<void> => {
  try {
    await run()
  } catch (error) {
    console.error(`planning: ${label} failed:`, error)
  }
}

/** The event a settled transition publishes. `record` is in-process only — strip it before a bus. */
export const commitEventOf = (
  transition: Transition, state: CommitState, at: string, extra?: { error?: string, record?: Workcard | null }
): CommitEvent => clean({
  transition: transition.id!,
  card: transition.card,
  entityId: transition.entityId,
  project: transition.project,
  kind: transition.kind,
  type: transition.type,
  seq: transition.seq,
  action: transition.action,
  state,
  at,
  error: extra?.error,
  record: extra?.record,
})

const bearsRelationships = (transition: Transition): boolean =>
  transition.action === TransitionAction.Link
  || transition.action === TransitionAction.Unlink
  || transition.action === TransitionAction.Delete
  || (transition.action === TransitionAction.Create && (transition.links?.length ?? 0) > 0)

const foldRelationships = async (store: PlanningStore, transition: Transition): Promise<void> => {
  const links = store.links
  if (links == null || !bearsRelationships(transition)) {
    return
  }
  const where = { entityId: transition.entityId }
  const [outgoing, incoming] = await Promise.all([
    links.list({ ...where, from: transition.card }, { size: 0 }),
    links.list({ ...where, to: transition.card }, { size: 0 }),
  ])
  const before = [...new Map([...outgoing.items, ...incoming.items].map(link => [link.id, link])).values()]
  const after = applyRelationship(before, transition)
  const kept = new Set(after.filter(link => link.id != null).map(link => link.id))

  for (const link of before) {
    if (link.id != null && !kept.has(link.id)) {
      await links.drop({ entityId: transition.entityId, id: link.id })
    }
  }
  for (const link of after) {
    if (link.id == null) {
      await links.put(link as Relationship)
    }
  }
}

const writeFold = async (
  store: PlanningStore, before: Workcard | null, after: Workcard | null, transition: Transition
): Promise<void> => {
  if (transition.action === TransitionAction.Delete) {
    if (before != null && isProject(before)) {
      // A project takes everything under it, its own log included — the hub remembers the commit.
      await store.cards.purge(transition.card, transition.entityId)
      return
    }
    await foldRelationships(store, transition)
    await store.cards.drop(transition.card, transition.entityId)
    return
  }
  if (after != null) {
    await store.cards.put(after)
  }
  await foldRelationships(store, transition)
}

/**
 * Fold every pending transition of one card — the projection body every store reuses.
 *
 * Transitions are read in `seq` order past the card's own `seq`, and only `pending` ones are
 * applied, each with `applyTransition` and nothing else. Per transition: write the record (a
 * `delete` drops it, a project `delete` purges everything under it), fold its relationships, mark
 * it `committed`, `publish` the event, then run `onCommitted` — so the `after` chain runs in THIS
 * process, exactly once per committed transition. A transition that cannot be folded is marked
 * `failed` with the reason and a failed event is published, and the fold goes PAST it: the card's
 * `seq` advances to the failed transition with every other value as it was, so the next
 * transition applies normally. Nothing is removed from the log. A create that fails leaves no card
 * to advance, so what follows it fails too; a store that refuses the advancing write itself stops
 * the fold there and reports `followUp`, leaving the rest pending for a retry.
 *
 * The caller owns single flight: two folds of one card running at once would both publish.
 *
 * @throws {PlanningUnsupported} for a store without a transition log
 */
export const foldPending = async (
  store: PlanningStore, cardId: string, entityId: string, opts: FoldOptions = {}
): Promise<FoldResult> => {
  const transitions = store.transitions
  if (transitions == null) {
    throw new PlanningUnsupported(`fold:${store.alias ?? 'store'}`)
  }
  const now = opts.now ?? isoNow

  let card = await store.cards.get(cardId, entityId)
  const listed = await transitions.list(
    { entityId, card: cardId, sinceSeq: card?.seq ?? 0, state: CommitState.Pending },
    { sort: ['seq'], size: opts.limit ?? 0 }
  )

  let folded = 0
  let failed = 0
  for (const transition of listed.items) {
    if (transition.commit.state !== CommitState.Pending || transition.id == null) {
      continue
    }
    await opts.touch?.()
    const at = now()

    let next: Workcard | null
    try {
      next = applyTransition(card, transition)
      if (card != null && next === card) {
        // Already applied by another folder, which owns its commit and its event.
        continue
      }
      await writeFold(store, card, next, transition)
    } catch (error) {
      failed++
      const message = errorText(error)
      if (card != null && transition.seq > card.seq) {
        // Fold PAST it: the record keeps its previous values and only its cursor moves, so the
        // next transition still applies. The card is re-written whole, which also undoes a write
        // that got half way before it threw.
        const skipped: Workcard = { ...card, seq: transition.seq, head: Math.max(card.head ?? card.seq, transition.seq) }
        try {
          await store.cards.put(skipped)
          card = skipped
        } catch (advance) {
          // The store itself refuses writes: leave the rest pending for a retry rather than
          // failing every later transition as out of order.
          console.error(`planning: cannot advance ${cardId} past failed seq ${transition.seq}:`, advance)
          await safely('commit failure', () => transitions.commit(transition.id!, { state: CommitState.Failed, at, error: message }))
          await safely('publish', () => opts.publish?.(commitEventOf(transition, CommitState.Failed, at, { error: message })))
          return { card, folded, failed, followUp: true }
        }
      }
      await safely('commit failure', () => transitions.commit(transition.id!, { state: CommitState.Failed, at, error: message }))
      const event = commitEventOf(transition, CommitState.Failed, at, { error: message })
      await safely('publish', () => opts.publish?.(event))
      continue
    }

    card = next
    folded++
    await safely('commit', () => transitions.commit(transition.id!, { state: CommitState.Committed, at }))
    const event = commitEventOf(transition, CommitState.Committed, at, { record: next })
    await safely('publish', () => opts.publish?.(event))
    await safely('onCommitted', () => opts.onCommitted?.(event))
  }

  return { card, folded, failed, followUp: listed.total > listed.items.length }
}

/**
 * Mark every pending transition of a card `failed` and publish a failed event for each — what a
 * queued store does when its projection job is dead, or waiters hang until their timeout.
 */
export const failPending = async (
  store: PlanningStore, cardId: string, entityId: string, reason: string,
  opts: Pick<FoldOptions, 'publish' | 'now'> = {}
): Promise<number> => {
  const transitions = store.transitions
  if (transitions == null) {
    return 0
  }
  const at = (opts.now ?? isoNow)()
  const pending = await transitions.list({ entityId, card: cardId, state: CommitState.Pending }, { sort: ['seq'], size: 0 })
  for (const transition of pending.items) {
    if (transition.id == null) {
      continue
    }
    await transitions.commit(transition.id, { state: CommitState.Failed, at, error: reason })
    const event = commitEventOf(transition, CommitState.Failed, at, { error: reason })
    await safely('publish', () => opts.publish?.(event))
  }

  return pending.items.length
}

const CONTENT_KEYS = ['body', 'ref', 'format', 'version'] as const

/**
 * A specification's history, replayed from its log: one entry per create and per committed
 * content change, newest first. The fold is `applyTransition` itself, so an entry's `body` is the
 * body AT that revision even when the transition changed only `ref`.
 */
export const revisionsFromLog = (log: Transition[], limit?: number): SpecificationRevision[] => {
  const ordered = log.filter(transition => transition.commit.state !== CommitState.Pending)
    .sort((left, right) => left.seq - right.seq)

  const entries: SpecificationRevision[] = []
  let state: Workcard | null = null
  for (const transition of ordered) {
    if (transition.commit.state === CommitState.Failed) {
      // The fold went past it; so does the replay.
      if (state != null && transition.seq > state.seq) {
        state = { ...(state as Workcard), seq: transition.seq }
      }
      continue
    }
    try {
      state = applyTransition(state, transition)
    } catch {
      break
    }
    if (state == null) {
      break
    }
    const changed = transition.action === TransitionAction.Create
      || CONTENT_KEYS.some(key => (transition.changes as Record<string, unknown>)[key] !== undefined
        || transition.unset?.includes(key) === true)
    if (!changed) {
      continue
    }
    const spec = state as Workcard & { body?: string, ref?: string, bodyChars?: number, version?: number, revision?: number }
    entries.push(clean({
      revision: spec.revision ?? entries.length + 1,
      body: spec.body,
      ref: spec.ref,
      bodyChars: spec.bodyChars,
      version: spec.version,
      at: transition.at,
      by: transition.actor,
      transition: transition.id!,
    }))
  }

  const newest = entries.reverse()
  return limit != null && limit > 0 ? newest.slice(0, limit) : newest
}
