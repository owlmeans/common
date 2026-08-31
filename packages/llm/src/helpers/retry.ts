import { LlmRetryExceededError } from '../errors.js'
import { plugins } from '../plugins/index.js'
import type { FatalErrorResolver, RetryOptions } from '../types.js'

const resolvers: FatalErrorResolver[] = []

/**
 * Register a globally-applicable rule that turns a thrown error into an immediate
 * abort of every retry loop in this package. Use it for conditions no amount of
 * retrying can fix — an exhausted budget, a revoked credential, a cancelled job.
 *
 * Provider plugins contribute their own through `LlmPlugin.isFatal`; both sets are
 * consulted, plus the per-call {@link RetryOptions.fatal}.
 */
export const registerFatalError = (resolver: FatalErrorResolver): void => {
  resolvers.push(resolver)
}

const resolveFatal = (e: unknown, fatal?: FatalErrorResolver): Error | null => {
  const own = fatal?.(e)
  if (own != null) return own
  for (const resolver of resolvers) {
    const found = resolver(e)
    if (found != null) return found
  }
  for (const plugin of Object.values(plugins)) {
    const found = plugin.isFatal?.(e)
    if (found != null) return found
  }
  return null
}

/**
 * Run `fn` up to `retries` times, passing the 0-based attempt number so the callee can
 * escalate (a bigger output budget, a stronger model). Every non-fatal error is
 * swallowed and retained as the `cause` of the {@link LlmRetryExceededError} thrown when
 * the attempts run out; a fatal error (see {@link registerFatalError}) is rethrown at once.
 */
export const withRetry = async <T>(
  { retries, outputErrors = false, fatal }: RetryOptions,
  fn: (attempt: number) => Promise<T>
): Promise<T> => {
  const exceeded = new LlmRetryExceededError('max-retries')
  for (let i = 0; i < retries; ++i) {
    try {
      return await fn(i)
    } catch (e) {
      const abort = resolveFatal(e, fatal)
      if (abort != null) throw abort
      exceeded.cause = e
      exceeded.attempt = i
      if (outputErrors) {
        console.debug('Retry error on attempt', i)
        console.error(e)
      }
    }
  }
  throw exceeded
}
