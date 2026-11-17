/** Statuses a `Response` may not be constructed with a body for. */
export const NULL_BODY_STATUSES: readonly number[] = [101, 103, 204, 205, 304]

/** Headers that describe the body as it arrived, wrong for a body rebuilt from it. */
export const BODY_HEADERS: readonly string[] = ['content-length', 'content-encoding']
