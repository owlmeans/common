/** What a non-strict OpenAI `json_schema` hides from the model, put back where the model reads it. */
export interface OpenAiConstraintsHelper {
  /**
   * A deep copy of `schema` whose nodes carry, at the end of their `description`, the constraints
   * the provider strips from what it shows: "Required." on a property its object requires,
   * "May be null." on a `nullable` node, lengths, item counts, bounds, `pattern` and `format`. Only
   * schema positions are walked — never `enum`, `const`, `default` or `examples` values. The
   * caller's schema is never edited, and Ajv keeps validating it as written.
   */
  fold: (schema: unknown) => unknown
}
