import { FALLBACK_AFTER_ATTEMPTS } from '../consts.js'
import { LlmRetryExceededError, type LlmSchemaRejection } from '../errors.js'
import { REPEATED_REFUSAL } from './attempts/consts.js'
import type { AttemptStep, AttemptUtils, CallAttempts, CallAttemptsParams, SchemaVerdict } from './attempts/types.js'
import { refusalUtils } from './refusal.js'
import { rungUtils } from './rungs.js'

export const createAttemptUtils = (): AttemptUtils => {
  const of = ({ ladder, seed, retries, fatal }: CallAttemptsParams): CallAttempts => {
    const start = rungUtils.rungAt(ladder, seed)
    let climbs = 0
    // The rung the latest attempt ran on, where it began counting and how many climbs came before it.
    let rungIndex = start.rung.index
    let rungBase = start.rungAttempt
    let rungClimbs = 0
    // The latest attempt's schema refusal, until `next` confirms it was what that attempt threw.
    let pending: { index: number, error: unknown, signature: string, rung: number } | null = null
    let last: { signature: string, rung: number } | null = null
    let jump: { from: number, to: number } | null = null
    const stops = new WeakSet<object>()

    const at = (index: number): AttemptStep => {
      const attempt = seed + index
      const { rung, rungAttempt: position } = rungUtils.rungAt(ladder, attempt)
      if (rung.index !== rungIndex) {
        rungIndex = rung.index
        rungBase = 0
        rungClimbs = climbs
      }

      return {
        attempt, rung, rungAttempt: rungBase + climbs - rungClimbs, climb: seed + climbs,
        entered: rung.index > 0 && position === 0,
      }
    }

    const climbing = <E>(error: E): E => {
      climbs += 1
      return error
    }

    const schemaRefused = (error: LlmSchemaRejection, index: number, corrected: boolean): SchemaVerdict => {
      const signature = refusalUtils.signatureOf(error.details)
      const rung = rungUtils.rungAt(ladder, seed + index).rung.index
      pending = { index, error, signature, rung }
      if (!corrected || last?.signature !== signature || last.rung !== rung) {
        return { next: 'retry', ends: index + 1 >= retries, signature }
      }
      const to = (rung + 1) * FALLBACK_AFTER_ATTEMPTS - seed
      if (rung < ladder.length - 1 && to < retries) {
        jump = { from: index, to }
        return { next: 'rung', ends: false, signature }
      }

      return { next: 'stop', ends: true, signature }
    }

    const stop = (refusal: unknown, index: number): LlmRetryExceededError => {
      const error = new LlmRetryExceededError(REPEATED_REFUSAL)
      error.cause = refusal
      error.attempt = index
      stops.add(error)

      return error
    }

    const next = (index: number, error: unknown): number => {
      last = pending != null && pending.index === index && pending.error === error
        ? { signature: pending.signature, rung: pending.rung }
        : null
      pending = null
      const to = jump != null && jump.from === index ? jump.to : index + 1
      jump = null

      return to
    }

    const resolveFatal = (e: unknown): Error | null =>
      fatal?.(e) ?? (e != null && typeof e === 'object' && stops.has(e) ? e as Error : null)

    return { at, climbing, schemaRefused, stop, next, fatal: resolveFatal }
  }

  return { of }
}

export const attemptUtils = createAttemptUtils()
