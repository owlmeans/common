/** The text of anything thrown — what an activity, a row or `lastError` records. */
export const messageOf = (error: unknown): string => error instanceof Error ? error.message : `${error}`
