export interface ErrorDataOptions {
  /** Text headers carry compact causes; JSON sinks also retain bounded cause stacks. */
  causeStacks?: boolean
}

/** Makes values safe to write to a log sink. */
export interface RedactHelper {
  /** Allowlisted Error fields and bounded actual Error.cause chains; never SDK request/config data. */
  errorData: (error: Error, options?: ErrorDataOptions) => Record<string, unknown>
  /**
   * A copy of `value` that is safe to write: values under a secret-looking key are replaced, bytes
   * (a `Buffer`, a typed array, an `ArrayBuffer`) become their size, strings are clipped, depth and
   * breadth are capped and cycles are cut. It never throws.
   */
  redact: (value: unknown, depth?: number, seen?: WeakSet<object>) => unknown
}
