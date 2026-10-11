export const SEPARATOR = '\n\n'

/** Ordering weight of a pipeline plugin that declares none. */
export const DEFAULT_PIPELINE_PLUGIN_ORDER = 50

/**
 * How many questions ONE composing step may relay for its child before it gives up.
 *
 * A composed pipeline that keeps asking is a pipeline that will never finish, and the parent is the
 * only place with a count to bound it: each round is a fresh child invocation, so nothing else in
 * the stack can see that it is the same step asking again.
 */
export const MAX_INQUIRY_ROUNDS = 8
