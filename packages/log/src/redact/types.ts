/** Makes values safe to write to a log sink. */
export interface RedactHelper {
  /** An `Error` as plain data — name, message, code and the stack, never its other own fields. */
  errorData: (error: Error) => Record<string, unknown>
  /**
   * A copy of `value` that is safe to write: values under a secret-looking key are replaced,
   * strings are clipped, depth and breadth are capped and cycles are cut. It never throws.
   */
  redact: (value: unknown, depth?: number, seen?: WeakSet<object>) => unknown
}
