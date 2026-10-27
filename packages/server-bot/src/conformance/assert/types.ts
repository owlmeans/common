/** The expectations a conformance case states — each throws `BotConformanceFailure` when it does not hold. */
export interface BotAssertHelper {
  check: (condition: unknown, message: string) => void
  /** Structural equality over JSON values (key order ignored). */
  same: (actual: unknown, expected: unknown, message: string) => void
  /** The promise rejects with an error whose `type` is `expected.typeName` (or an instance of it). */
  rejects: (run: Promise<unknown>, expected: { typeName: string }, message: string) => Promise<void>
  /** Poll `probe` until it answers true or `timeoutMs` passes. */
  eventually: (probe: () => Promise<boolean>, message: string, timeoutMs?: number) => Promise<void>
}
