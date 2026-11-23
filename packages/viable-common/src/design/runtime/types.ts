import type { WorkcardActor } from '../consts.js'
import type { WorkcardDesignBotHandler, WorkcardDesignRuntime } from '../types.js'

/**
 * What a story needs BEYOND a screen, an endpoint and a table — and the standing answer is
 * "nothing". See `design/runtime.ts`.
 */
export interface WorkcardRuntimeHelper {
  isEphemeralActor: (actor?: WorkcardActor) => boolean
  /** Read the gate off a design, total over a design that predates it. */
  runtimeOf: (design?: { runtime?: WorkcardDesignRuntime }) => WorkcardDesignRuntime
  /** Whether anything at all was asked for — the one check every new step is gated on. */
  needsRuntime: (runtime: WorkcardDesignRuntime) => boolean
  /**
   * The bot handlers of a runtime, total: an absent `bot` block reads as none. Kept apart from
   * {@link WorkcardRuntimeHelper.needsRuntime}, which asks about the queue, the worker and agents only.
   */
  botHandlersOf: (runtime: WorkcardDesignRuntime) => WorkcardDesignBotHandler[]
}
