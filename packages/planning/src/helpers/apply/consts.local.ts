/** Never written by a transition's `changes`: the fold takes them from the transition itself. */
export const IDENTITY_KEYS = new Set(['id', 'kind', 'type', 'entityId', 'seq', 'head', 'createdAt'])

/** Cannot be cleared: a record without them is not a record. */
export const REQUIRED_KEYS = new Set([
  ...IDENTITY_KEYS, 'title', 'parents', 'status', 'intrinsic', 'flows', 'labels', 'fields',
])

/** Merged shallowly into the card's own map rather than replacing it. */
export const MERGED_KEYS = new Set(['fields', 'flows'])
