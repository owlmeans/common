/** Where a wrapping error keeps the one it wraps — `cause`, and the fields frameworks use for it. */
export const NESTED_FIELDS = ['cause', 'error', 'original', 'originalError', 'inner', 'reason'] as const

/** How deep a wrapped chain is followed — a planning `CommitFailed` inside a transport error is two. */
export const MAX_DEPTH = 5

export const PRECONDITION_REQUIRED = 428

export const DECLINED_MARKER = 'consent-declined:'
