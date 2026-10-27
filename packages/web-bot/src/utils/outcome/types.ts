import type { BotOutcome } from '../../types.js'

/** How the hooks turn a call into an outcome that never throws. */
export interface BotOutcomeUtils {
  /**
   * Run one call: its value as `{ ok: true, value }`, or its failure — rebuilt as the registered
   * error class (`ResilientError.ensure`), so a `BotError` arrives as itself — as
   * `{ ok: false, error }`. The failure is logged at debug for the operator; the person learns of it
   * from the outcome, where the operation was started.
   */
  run: <T>(call: () => Promise<T>) => Promise<BotOutcome<T>>
}
