import { sameValue } from '@owlmeans/planning'

/** A conformance expectation that did not hold. Plain `Error`, so any test runner reports it. */
export class ConformanceFailure extends Error {
  constructor(message: string) {
    super(`planning conformance: ${message}`)
    this.name = 'ConformanceFailure'
  }
}

const show = (value: unknown): string => {
  try {
    return JSON.stringify(value)
  } catch {
    return `${value}`
  }
}

/** @throws {ConformanceFailure} */
export const check = (condition: unknown, message: string): void => {
  if (condition !== true) {
    throw new ConformanceFailure(message)
  }
}

/** Structural equality over JSON values. @throws {ConformanceFailure} */
export const same = (actual: unknown, expected: unknown, message: string): void => {
  if (!sameValue(actual, expected)) {
    throw new ConformanceFailure(`${message}: expected ${show(expected)}, got ${show(actual)}`)
  }
}

/** The same members in any order. @throws {ConformanceFailure} */
export const sameSet = (actual: readonly unknown[], expected: readonly unknown[], message: string): void => {
  const sort = (values: readonly unknown[]) => [...values].map(show).sort()
  same(sort(actual), sort(expected), message)
}

/**
 * The promise rejects with an error of the class (matched by instance or by its registered type
 * name, so a duplicate module copy counts). Answers the error.
 *
 * @throws {ConformanceFailure}
 */
export const rejects = async (
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
