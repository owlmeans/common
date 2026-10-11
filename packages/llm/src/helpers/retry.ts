import { logger } from '@owlmeans/log'
import { LlmMissconfiguredError, LlmRetryExceededError } from '../errors.js'
import { llmPluginRegistry } from '../plugins/registry.js'
import type { FatalErrorResolver, RetryHelper, RetryOptions } from './retry/types.js'

const log = logger('llm')

/**
 * A misconfiguration is the same on every attempt: no retry, rung or climb can change it.
 *
 * Module-level on purpose: the registry is process-wide — a rule registered through any
 * instance must stop every retry loop of the process.
 */
const resolvers: FatalErrorResolver[] = [e => e instanceof LlmMissconfiguredError ? e : null]

export const createRetryHelper = (): RetryHelper => {
  const registerFatalError = (resolver: FatalErrorResolver): void => {
    resolvers.push(resolver)
  }

  const resolveFatal = (e: unknown, fatal?: FatalErrorResolver): Error | null => {
    const own = fatal?.(e)
    if (own != null) return own
    for (const resolver of resolvers) {
      const found = resolver(e)
      if (found != null) return found
    }
    for (const plugin of Object.values(llmPluginRegistry.plugins)) {
      const found = plugin.isFatal?.(e)
      if (found != null) return found
    }
    return null
  }

  const isFatalError = (e: unknown, fatal?: FatalErrorResolver): Error | null =>
    resolveFatal(e, fatal)

  const withRetry = async <T>(
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
          log.warn('Retry error on attempt', { attempt: i, error: e })
        }
      }
    }
    throw exceeded
  }

  return { registerFatalError, isFatalError, withRetry }
}

export const retryHelper = createRetryHelper()

/** @deprecated compat:factory-refactor — use `retryHelper.registerFatalError(…)` */
export const registerFatalError = (resolver: FatalErrorResolver): void => retryHelper.registerFatalError(resolver)

/** @deprecated compat:factory-refactor — use `retryHelper.isFatalError(…)` */
export const isFatalError = (e: unknown, fatal?: FatalErrorResolver): Error | null => retryHelper.isFatalError(e, fatal)

/** @deprecated compat:factory-refactor — use `retryHelper.withRetry(…)` */
export const withRetry = <T>(options: RetryOptions, fn: (attempt: number) => Promise<T>): Promise<T> =>
  retryHelper.withRetry(options, fn)
