import { MC_GROUP_COMMUNICATIONS, MC_GROUP_DATA } from '@owlmeans/marketing-consent'

export const GROUP_ORDER = [MC_GROUP_COMMUNICATIONS, MC_GROUP_DATA]

/**
 * How long the status load may take before the screen treats it as unreadable rather than show
 * "Loading…" forever — a broken network (or a broken server) must never trap a signed-in person
 * here silently.
 */
export const LOAD_TIMEOUT = 10_000
