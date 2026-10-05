/** The expectations a conformance case states — each throws `ConformanceFailure` when it does not hold. */
export interface AssertHelper {
  /** @throws {ConformanceFailure} */
  check: (condition: unknown, message: string) => void
  /** Structural equality over JSON values. @throws {ConformanceFailure} */
  same: (actual: unknown, expected: unknown, message: string) => void
  /** The same members in any order. @throws {ConformanceFailure} */
  sameSet: (actual: readonly unknown[], expected: readonly unknown[], message: string) => void
  /**
   * The promise rejects with an error of the class (matched by instance or by its registered type
   * name, so a duplicate module copy counts). Answers the error.
   *
   * @throws {ConformanceFailure}
   */
  rejects: (run: Promise<unknown> | (() => Promise<unknown>), expected: { typeName: string }, message: string) => Promise<Error>
}
