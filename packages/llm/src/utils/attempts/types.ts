import type { LlmRetryExceededError, LlmSchemaRejection } from '../../errors.js'
import type { FatalErrorResolver } from '../../helpers/retry/types.js'
import type { Rung } from '../rungs/types.js'

/** Where one attempt of a call runs, and how far its escalation has climbed. */
export interface AttemptStep {
  /**
   * `seed + index`: picks the rung ({@link FALLBACK_AFTER_ATTEMPTS} attempts each) and is the
   * plugin's `attempt` — so a delegated performer still sees `attempt > 0` on every retry.
   */
  attempt: number
  rung: Rung
  /**
   * Budget-fixable failures since the call entered this rung — from the seed's own position on the
   * rung it starts on: the plugin's `rungAttempt`, which effort climbs with.
   */
  rungAttempt: number
  /** `seed` + budget-fixable failures so far: the plugin's `climb`, which the output budget doubles with. */
  climb: number
  /** The first attempt on a fallback rung. */
  entered: boolean
}

/** What a schema refusal leads to. */
export interface SchemaVerdict {
  /**
   * `retry`: ask again, corrected; `rung`: the same refusal came back after a correction — the next
   * attempt is the next rung's first; `stop`: it came back on the last rung — the call ends.
   */
  next: 'retry' | 'rung' | 'stop'
  /** This attempt is the call's last: only a pruned answer can still be accepted. */
  ends: boolean
  /** The refusal's signature (`refusalUtils.signatureOf`). */
  signature: string
}

/**
 * The escalation state of ONE call: which rung each attempt runs on, how far the output budget and
 * effort have climbed, and whether a schema refusal keeps repeating. Built per call.
 */
export interface CallAttempts {
  /** Where the attempt with this loop index runs. */
  at: (index: number) => AttemptStep
  /**
   * Count a budget-fixable failure — a null, empty or unparseable answer, a filter refusal: the next
   * attempt climbs. Schema refusals, stalls and transport errors are never counted. Answers the
   * error, so the attempt throws it.
   */
  climbing: <E>(error: E) => E
  /**
   * Judge a schema refusal of the attempt with this loop index. It REPEATS when the previous
   * attempt, on the same rung, was refused with the same signature and this one was already sent
   * with a correction (`corrected`).
   */
  schemaRefused: (error: LlmSchemaRejection, index: number, corrected: boolean) => SchemaVerdict
  /**
   * The error a `stop` verdict ends the call with: `LlmRetryExceededError('repeated-refusal')`
   * carrying the refusal as `cause` — fatal for this call's loop through {@link CallAttempts.fatal}.
   */
  stop: (refusal: unknown, index: number) => LlmRetryExceededError
  /** `RetryOptions.next`: the next loop index — the next rung's first attempt after a `rung` verdict. */
  next: (index: number, error: unknown) => number
  /** `RetryOptions.fatal`: the caller's own resolver first, then this call's stop. */
  fatal: FatalErrorResolver
}

export interface CallAttemptsParams {
  /** The rungs this call may run on. */
  ladder: Rung[]
  /** Where the call starts on its ladder (`LlmCallOptions.escalation`, clamped). */
  seed: number
  retries: number
  /** The caller's own `LlmCallOptions.fatal`. */
  fatal?: FatalErrorResolver | undefined
}

export interface AttemptUtils {
  of: (params: CallAttemptsParams) => CallAttempts
}
