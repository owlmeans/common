import { PlanningScopeMismatch, WorkcardNotFound } from '@owlmeans/planning'
import type { Workcard } from '@owlmeans/planning'

export const notFoundOf = (id: string): WorkcardNotFound => new WorkcardNotFound(id)

/**
 * A record of another entity is absent, not forbidden.
 *
 * @throws {WorkcardNotFound}
 */
export const assertScope = <T extends Pick<Workcard, 'entityId'>>(
  record: T | null | undefined, scope: { entityId: string }, id: string
): T => {
  if (record == null || record.entityId !== scope.entityId) {
    throw notFoundOf(id)
  }
  return record
}

/**
 * Run a handler body so that a scope mismatch leaves as `WorkcardNotFound` — telling "not yours"
 * apart from "does not exist" is what turns an id space into an enumeration oracle.
 */
export const concealed = async <T>(run: () => Promise<T>): Promise<T> => {
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

/** Seconds as the wire sends them, clamped to `[0, max]`. */
export const clampSeconds = (value: unknown, max: number): number => {
  const number = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(number) ? Math.min(Math.max(number, 0), max) : 0
}
