/**
 * A clock that never repeats an instant — what a conformance service is booted with, so an
 * `updatedSince` or an ordering by `at` is deterministic on a fast store.
 */
export const conformanceClock = (): (() => string) => {
  let last = 0
  return () => {
    last = Math.max(Date.now(), last + 1)
    return new Date(last).toISOString()
  }
}
