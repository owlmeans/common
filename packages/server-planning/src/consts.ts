import { PLANNING_SERVICE } from '@owlmeans/planning'

/** The alias `appendPlanningService` registers the host under — the same one a client uses. */
export const DEFAULT_ALIAS = PLANNING_SERVICE

/** The alias a memory store answers `PlanningStore.alias` with. */
export const MEMORY_STORE_ALIAS = 'planning-memory'

/**
 * How many settled commits a hub remembers after their transition row may be gone.
 *
 * A project `delete` purges the project's own log, so without this a waiter that polls a moment
 * after the fold would be told the transition never existed.
 */
export const DEFAULT_COMMIT_MEMORY = 1000

/**
 * The poll ladder `wait` climbs after its first immediate poll, in milliseconds. The last step
 * repeats. The subscription answers first whenever the fold publishes where the hub hears it; the
 * ladder is what answers when it folded somewhere the hub does not.
 */
export const COMMIT_POLL_LADDER: readonly number[] = Object.freeze([250, 1000, 2000])
