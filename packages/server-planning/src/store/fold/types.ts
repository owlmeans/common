import type { CommitEvent, CommitState, PlanningStore, SpecificationRevision, Transition, Workcard } from '@owlmeans/planning'
import type { FoldOptions, FoldResult } from '../types.js'

/** The projection body every store reuses: the fold of a card's pending log, and what it publishes. */
export interface FoldHelper {
  /** The event a settled transition publishes. `record` is in-process only — strip it before a bus. */
  commitEventOf: (
    transition: Transition, state: CommitState, at: string, extra?: { error?: string, record?: Workcard | null }
  ) => CommitEvent
  /**
   * Fold every pending transition of one card — the projection body every store reuses.
   *
   * Transitions are read in `seq` order past the card's own `seq`, and only `pending` ones are
   * applied, each with `applyHelper.applyTransition` and nothing else. Per transition: write the
   * record (a `delete` drops it, a project `delete` purges everything under it), fold its
   * relationships, mark it `committed`, `publish` the event, then run `onCommitted` — so the `after`
   * chain runs in THIS process, exactly once per committed transition. A transition that cannot be
   * folded is marked `failed` with the reason and a failed event is published, and the fold goes PAST
   * it: the card's `seq` advances to the failed transition with every other value as it was, so the
   * next transition applies normally. Nothing is removed from the log. A create that fails leaves no
   * card to advance, so what follows it fails too; a store that refuses the advancing write itself
   * stops the fold there and reports `followUp`, leaving the rest pending for a retry.
   *
   * The caller owns single flight: two folds of one card running at once would both publish. A
   * transactional store passes `unit`, which wraps each transition's writes (a savepoint), so a write
   * the database refuses is undone whole before the fold marks the transition failed.
   *
   * @throws {PlanningUnsupported} for a store without a transition log
   */
  foldPending: (store: PlanningStore, cardId: string, entityId: string, opts?: FoldOptions) => Promise<FoldResult>
  /**
   * Mark every pending transition of a card `failed` and publish a failed event for each — what a
   * queued store does when its projection job is dead, or waiters hang until their timeout.
   */
  failPending: (
    store: PlanningStore, cardId: string, entityId: string, reason: string, opts?: Pick<FoldOptions, 'publish' | 'now'>
  ) => Promise<number>
  /**
   * A specification's history, replayed from its log: one entry per create and per committed
   * content change, newest first. The fold is `applyHelper.applyTransition` itself, so an entry's
   * `body` is the body AT that revision even when the transition changed only `ref`.
   */
  revisionsFromLog: (log: Transition[], limit?: number) => SpecificationRevision[]
}
