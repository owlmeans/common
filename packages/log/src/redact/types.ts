export interface ErrorDataOptions {
  /** Text headers carry compact causes; JSON sinks also retain bounded cause stacks. */
  causeStacks?: boolean
}

/** Makes values safe to write to a log sink. */
export interface RedactHelper {
  /**
   * Allowlisted Error fields and bounded actual Error.cause chains; never SDK request/config data.
   * Names, messages, string codes and stacks are redacted (keys, bearer tokens, token-like values
   * of secret-named keys) and clipped. It never throws: an error none of which can be read is
   * `{ name: 'Error', message: '[unserializable]' }`.
   */
  errorData: (error: Error, options?: ErrorDataOptions) => Record<string, unknown>
  /**
   * A copy of `value` that is safe to write: values under a secret-looking key are replaced, bytes
   * (a `Buffer`, a typed array, an `ArrayBuffer`) become their size, strings are clipped, depth and
   * breadth are capped and cycles are cut. It never throws.
   */
  redact: (value: unknown, depth?: number, seen?: WeakSet<object>) => unknown
  /**
   * Any value as text, never throwing: a string as is, an array joined by `'; '`, `null` and
   * `undefined` as `''`, anything else through `String()` (`'[unserializable]'` when that throws).
   */
  textOf: (value: unknown) => string
  /** An error's `message` as `textOf` text; a throwing getter reads as `''`. */
  messageOf: (error: Error) => string
}
