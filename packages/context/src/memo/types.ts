/** Lazy, memoized construction — the seam bound objects are reached through. */
export interface MemoHelper {
  /**
   * A thunk that builds its value on the first call and answers the same value after. A flag, not
   * `undefined`, marks it built, so a builder that returns `undefined` still runs once.
   */
  once: <T>(build: () => T) => () => T
  /**
   * One `make(target)` per target object: built on first use for that target and released with it
   * (a WeakMap), so a context, a request or a collaborator gets exactly one bound object.
   */
  oncePer: <K extends object, T>(make: (target: K) => T) => (target: K) => T
}
