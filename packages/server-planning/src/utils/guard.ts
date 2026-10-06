import { PlanningScopeMismatch, WorkcardNotFound } from '@owlmeans/planning'
import type { Workcard } from '@owlmeans/planning'
import type { GuardHelper } from './guard/types.js'

export const createGuardHelper = (): GuardHelper => {
  const notFoundOf = (id: string): WorkcardNotFound => new WorkcardNotFound(id)

  const assertScope = <T extends Pick<Workcard, 'entityId'>>(
    record: T | null | undefined, scope: { entityId: string }, id: string
  ): T => {
    if (record == null || record.entityId !== scope.entityId) {
      throw notFoundOf(id)
    }
    return record
  }

  const concealed = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run()
    } catch (error) {
      if (error instanceof PlanningScopeMismatch
        || (error as { type?: string } | null)?.type === PlanningScopeMismatch.typeName) {
        throw new WorkcardNotFound()
      }
      throw error
    }
  }

  const clampSeconds = (value: unknown, max: number): number => {
    const number = typeof value === 'number' ? value : Number(value ?? 0)
    return Number.isFinite(number) ? Math.min(Math.max(number, 0), max) : 0
  }

  return { notFoundOf, assertScope, concealed, clampSeconds }
}

export const guardHelper = createGuardHelper()

/** @deprecated compat:factory-refactor — use `guardHelper.notFoundOf(…)` */
export const notFoundOf = (id: string): WorkcardNotFound => guardHelper.notFoundOf(id)

/** @deprecated compat:factory-refactor — use `guardHelper.assertScope(…)` */
export const assertScope = <T extends Pick<Workcard, 'entityId'>>(
  record: T | null | undefined, scope: { entityId: string }, id: string
): T => guardHelper.assertScope<T>(record, scope, id)

/** @deprecated compat:factory-refactor — use `guardHelper.concealed(…)` */
export const concealed = async <T>(run: () => Promise<T>): Promise<T> => await guardHelper.concealed<T>(run)

/** @deprecated compat:factory-refactor — use `guardHelper.clampSeconds(…)` */
export const clampSeconds = (value: unknown, max: number): number => guardHelper.clampSeconds(value, max)
