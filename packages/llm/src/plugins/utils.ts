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
