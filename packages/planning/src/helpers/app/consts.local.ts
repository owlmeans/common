/** The kinds an application declares properties for, in merge order. */
export const APP_KINDS = ['type', 'flow', 'card'] as const

/** The only keywords a kind's declaration may carry — a merge by name honours nothing else. */
export const APP_SCHEMA_KEYS = new Set(['type', 'properties', 'required'])
