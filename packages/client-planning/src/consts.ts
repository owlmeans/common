import type { Relationship, Workcard } from '@owlmeans/planning'
import { stateAlias } from '@owlmeans/state'
import type { StateAlias } from '@owlmeans/state'
import type { PlanningCommitRecord, PlanningStoreAliases } from './types.js'

/**
 * The ONE card store. Projects, cards and specifications share an id space on the server, so they
 * share it here too — a store per kind would let a list reload of one kind drop another's rows.
 */
export const CARDS: StateAlias<Workcard> = stateAlias<Workcard>('planning-card-state')

export const LINKS: StateAlias<Relationship> = stateAlias<Relationship>('planning-link-state')

/** What the client has learned about each transition it wrote or saw, keyed by transition id. */
export const COMMITS: StateAlias<PlanningCommitRecord> = stateAlias<PlanningCommitRecord>('planning-commit-state')

export const DEFAULT_STORE_ALIASES: Readonly<PlanningStoreAliases> = Object.freeze({
  cards: CARDS,
  links: LINKS,
  commits: COMMITS,
})

/**
 * How much longer than its own `wait` a long poll's HTTP deadline is, in milliseconds — a held
 * response must outlast the hold, or every quiet poll reads as a broken connection.
 */
export const LONG_POLL_GRACE = 10_000

/**
 * The pause ladder between polls that came back pending without holding, in milliseconds.
 *
 * A server that does not hold (an old deployment, a proxy that answers early) would otherwise be
 * polled in a tight loop until the deadline.
 */
export const EARLY_POLL_LADDER: readonly number[] = Object.freeze([250, 1_000, 2_000])

/** A poll that answered faster than this did not hold. */
export const EARLY_POLL_MS = 250
