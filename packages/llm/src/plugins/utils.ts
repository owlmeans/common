/**
 * Shared construction bits for the built-in plugins. Internal to `plugins/` — not
 * part of the package's public surface.
 */

/**
 * `{ configuration: { baseURL?, defaultHeaders? } }` for the OpenAI-compatible client,
 * or an empty object when there is nothing to set (the client rejects an empty
 * `configuration` in some versions).
 */
export const makeConfiguration = (
  { baseURL, headers }: { baseURL: string | undefined, headers: Record<string, string> | undefined }
): { configuration: Record<string, unknown> } | Record<string, never> => {
  const hasBaseURL = baseURL != null
  const hasHeaders = headers != null && Object.keys(headers).length > 0
  if (!hasBaseURL && !hasHeaders) return {}
  return {
    configuration: {
      ...(hasBaseURL ? { baseURL } : {}),
      ...(hasHeaders ? { defaultHeaders: headers } : {}),
    }
  }
}

/** `{ clientOptions: { defaultHeaders } }` for the Anthropic client, or an empty object. */
export const makeClientOptions = (
  { headers }: { headers: Record<string, string> | undefined }
): { clientOptions: Record<string, unknown> } | Record<string, never> => {
  if (headers == null || Object.keys(headers).length === 0) return {}
  return { clientOptions: { defaultHeaders: headers } }
}

/**
 * Output budget for retry attempt N: double the base budget per attempt, clamped to
 * the model's hard ceiling.
 */
export const escalateMaxTokens = (base: number | undefined, attempt: number, cap: number): number =>
  Math.min((base ?? 2048) * Math.pow(2, attempt), cap)

/** How deep to follow `cause` before giving up — guards a self-referential chain. */
const MAX_CAUSE_DEPTH = 8

/**
 * Whether the error is — or wraps — an HTTP 400 from a provider.
 *
 * A 400 means the request itself is malformed: a schema the endpoint rejects, an
 * unsupported parameter, a `max_tokens` above the per-request limit, or an input past the
 * context window. Retrying re-sends the same shape and the retry escalator only raises the
 * OUTPUT budget, so none of those can improve with another attempt.
 *
 * The check walks the `cause` chain and never uses `instanceof`. Two independent reasons:
 * `@langchain/anthropic` and `@langchain/openai` bundle their own nested copies of the
 * provider SDKs, so their errors are instances of a DIFFERENT class than the one this
 * package imports; and langchain re-wraps provider failures in its own typed errors
 * (`ContextOverflowError` and friends) that carry the original only as `cause`, with no
 * `status` of their own. Either one silently defeats a surface-level check — an oversized
 * prompt then burns all eight attempts on a request that cannot succeed.
 */
export const isBadRequest = (e: unknown): boolean => {
  let current: unknown = e
  for (let depth = 0; current != null && depth < MAX_CAUSE_DEPTH; ++depth) {
    if ((current as { status?: unknown }).status === 400) return true
    const cause = (current as { cause?: unknown }).cause
    if (cause === current) return false
    current = cause
  }
  return false
}
