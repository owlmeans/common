/** Recovering and reconciling the JSON a model answered with. */
export interface JsonHelper {
  /**
   * Recover a JSON value from message content. Some models ignore the tool they were
   * pinned to and emit the schema-shaped JSON directly as plain message content, so the
   * tool-call parse yields nothing while the content is still valid JSON. Tolerates
   * markdown fences and leading/trailing prose by falling back to the outermost
   * `{...}` / `[...]` span. Returns `null` when nothing parseable is found.
   */
  parseJsonContent: (content: unknown) => unknown
  /**
   * Reconcile a model's answer with the schema it was given, for the two mistakes models
   * make most often with tool-call arguments:
   *
   * 1. **Stringified structures** — an `array` field filled with the string `"[]"`, an
   *    `integer` field with `"7"`, a `boolean` with `"true"`. Parsed back to the declared
   *    type; on a parse failure the original value is kept so validation reports the real error.
   * 2. **Over-wrapped scalars** — a `string` field filled with `{ path: "…" }` instead of
   *    `"…"`. Unwrapped via the likely key, or via the single string property if there is
   *    exactly one.
   *
   * Walks objects and arrays, so nested occurrences are fixed too. Purely defensive: a
   * value that already matches its schema is returned untouched.
   */
  coerceToSchema: (value: unknown, schema: unknown) => unknown
}
