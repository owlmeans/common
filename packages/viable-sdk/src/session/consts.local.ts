/** A pull that came back empty faster than this held nothing open. */
export const FAST_PULL_MS = 1_000

/** How long the pull loop rests after such a pull before asking again. */
export const EMPTY_PULL_PAUSE_MS = 1_500

/** What a connector that performs no model tasks answers one with. */
export const MODEL_TASKS_REFUSED = 'this connector does not perform model tasks'
