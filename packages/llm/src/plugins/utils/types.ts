/**
 * Shared construction bits for the built-in plugins. Internal to `plugins/` — not
 * part of the package's public surface.
 */
export interface PluginUtils {
  /**
   * `{ configuration: { baseURL?, defaultHeaders? } }` for the OpenAI-compatible client,
   * or an empty object when there is nothing to set (the client rejects an empty
   * `configuration` in some versions).
   */
  makeConfiguration: (
    params: { baseURL: string | undefined, headers: Record<string, string> | undefined }
  ) => { configuration: Record<string, unknown> } | Record<string, never>
  /** `{ clientOptions: { defaultHeaders } }` for the Anthropic client, or an empty object. */
  makeClientOptions: (
    params: { headers: Record<string, string> | undefined }
  ) => { clientOptions: Record<string, unknown> } | Record<string, never>
  /**
   * Output budget for retry attempt N: double the base budget per attempt, clamped to
   * the model's hard ceiling.
   */
  escalateMaxTokens: (base: number | undefined, attempt: number, cap: number) => number
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
  isBadRequest: (e: unknown) => boolean
}
