import type { StoryActor } from '../consts.js'
import type { StoryDesignRuntime } from '../types.js'

/**
 * What a story needs BEYOND a screen, an endpoint and a table — and the standing answer is
 * "nothing". See `design/runtime.ts`.
 */
export interface StoryRuntimeHelper {
  isEphemeralActor: (actor?: StoryActor) => boolean
  /** Read the gate off a design, total over a design that predates it. */
  runtimeOf: (design?: { runtime?: StoryDesignRuntime }) => StoryDesignRuntime
  /** Whether anything at all was asked for — the one check every new step is gated on. */
  needsRuntime: (runtime: StoryDesignRuntime) => boolean
}
