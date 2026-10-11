export interface RetryOptions {
  retries: number
  outputErrors?: boolean
  /**
   * Abort the retry loop for this call. Return the error to throw, or `null` to keep
   * retrying. Consulted in addition to the globally registered resolvers
   * (`registerFatalError`) and the provider plugins' `isFatal`.
   */
  fatal?: (e: unknown) => Error | null
}

/** Decides whether an error must abort a retry loop instead of being retried. */
export interface FatalErrorResolver {
  (e: unknown): Error | null
}

/** The one answer to "can any retry fix this?", and the loop that asks it. */
export interface RetryHelper {
  /**
   * Register a globally-applicable rule that turns a thrown error into an immediate
   * abort of every retry loop in this package. Use it for conditions no amount of
   * retrying can fix — an exhausted budget, a revoked credential, a cancelled job.
   *
   * Provider plugins contribute their own through `LlmPlugin.isFatal`; both sets are
   * consulted, plus the per-call {@link RetryOptions.fatal}.
   */
  registerFatalError: (resolver: FatalErrorResolver) => void
  /**
   * The one answer to "can any retry fix this?", exported so callers above the retry loop can ask it.
   *
   * A retry loop is not the only place that decides to carry on: a fix ladder rescues a failed
   * repair and climbs to a stronger model, an agent runner catches a round that threw and reports
   * "gave up". Both of those are right for a model that answered badly and wrong for a budget that
   * ran out — and a blanket `catch` cannot tell them apart, so an exhausted balance became more
   * expensive calls rather than a halt. Rather than each caller re-deriving the rule (and drifting
   * from it), they ask the same resolvers, in the same order, that `withRetry` uses.
   *
   * Returns the error to abort WITH — a resolver may unwrap a carrier and hand back the real
   * cause — or `null` when nothing considers it terminal.
   */
  isFatalError: (e: unknown, fatal?: FatalErrorResolver) => Error | null
  /**
   * Run `fn` up to `retries` times, passing the 0-based attempt number so the callee can
   * escalate (a bigger output budget, a stronger model). Every non-fatal error is
   * swallowed and retained as the `cause` of the {@link LlmRetryExceededError} thrown when
   * the attempts run out; a fatal error (see {@link RetryHelper.registerFatalError}) is rethrown at once.
   */
  withRetry: <T>(options: RetryOptions, fn: (attempt: number) => Promise<T>) => Promise<T>
}
