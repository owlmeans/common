/** Never in a caller's changes: the transition itself carries them. */
export const IDENTITY_KEYS = ['id', 'kind', 'type', 'entityId', 'seq', 'head', 'createdAt']

/** Written once, from a create's draft; never by `changes` or `unset`, whatever the action. */
export const PROVENANCE_KEYS = ['createdBy']

/** Move only through `transit` (or a create's draft). */
export const FLOW_KEYS = ['status', 'intrinsic', 'flows', 'closedAt']

/** Computed by the executor, never supplied. */
export const DERIVED_KEYS = ['revision', 'bodyChars']

/** Cannot be cleared. */
export const REQUIRED_KEYS = ['title', 'parents', 'labels', 'fields', 'category', 'format']

/** Changing one of these produces a new revision of a revisioned document. */
export const CONTENT_KEYS = ['body', 'ref', 'format', 'version']
