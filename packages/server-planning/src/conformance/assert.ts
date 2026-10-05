import { changesHelper } from '@owlmeans/planning'
import type { AssertHelper } from './assert/types.js'
import { ConformanceFailure } from './errors.js'

export { ConformanceFailure } from './errors.js'

const show = (value: unknown): string => {
  try {
    return JSON.stringify(value)
  } catch {
    return `${value}`
  }
}

export const createAssertHelper = (): AssertHelper => {
  const check = (condition: unknown, message: string): void => {
    if (condition !== true) {
      throw new ConformanceFailure(message)
    }
  }

  const same = (actual: unknown, expected: unknown, message: string): void => {
    if (!changesHelper.sameValue(actual, expected)) {
      throw new ConformanceFailure(`${message}: expected ${show(expected)}, got ${show(actual)}`)
    }
  }

  const sameSet = (actual: readonly unknown[], expected: readonly unknown[], message: string): void => {
    const sort = (values: readonly unknown[]) => [...values].map(show).sort()
    same(sort(actual), sort(expected), message)
  }

  const rejects = async (
    run: Promise<unknown> | (() => Promise<unknown>), expected: { typeName: string }, message: string
  ): Promise<Error> => {
    try {
      await (typeof run === 'function' ? run() : run)
    } catch (error) {
      const type = (error as { type?: unknown } | null)?.type
      if (error instanceof (expected as unknown as abstract new (...args: never[]) => unknown)
        || (typeof type === 'string' && type === expected.typeName)) {
        return error as Error
      }
      throw new ConformanceFailure(`${message}: expected ${expected.typeName}, got ${show((error as Error)?.message ?? error)}`)
    }
    throw new ConformanceFailure(`${message}: expected ${expected.typeName}, nothing was thrown`)
  }

  return { check, same, sameSet, rejects }
}

export const assertHelper = createAssertHelper()

/** @deprecated compat:factory-refactor — use `assertHelper.check(…)` */
export const check = (condition: unknown, message: string): void => assertHelper.check(condition, message)

/** @deprecated compat:factory-refactor — use `assertHelper.same(…)` */
export const same = (actual: unknown, expected: unknown, message: string): void => assertHelper.same(actual, expected, message)

/** @deprecated compat:factory-refactor — use `assertHelper.sameSet(…)` */
export const sameSet = (actual: readonly unknown[], expected: readonly unknown[], message: string): void =>
  assertHelper.sameSet(actual, expected, message)

/** @deprecated compat:factory-refactor — use `assertHelper.rejects(…)` */
export const rejects = async (
  run: Promise<unknown> | (() => Promise<unknown>), expected: { typeName: string }, message: string
): Promise<Error> => await assertHelper.rejects(run, expected, message)
