import type { FatalErrorResolver } from '../../helpers/retry/types.js'
import type { LlmGuide, ModelInput } from '../../types.js'

/**
 * The guidance of ONE call: what its next attempt appends after the caller's input once an attempt
 * was refused for its output. Built per call, so nothing leaks between calls of one model.
 */
export interface CallGuidance<T> {
  /** True once a refusal left guidance for the next attempt. */
  active: () => boolean
  /** The caller's input followed by the current guidance — the input itself while there is none. */
  input: (input: ModelInput) => ModelInput
  /**
   * Hand a refusal to the call's guide and keep what it answers for the next attempt (the latest
   * replaces the previous). Answers the error, so the attempt throws it: `throw await refused(…)`.
   */
  refused: (error: unknown, attempt: number, output: T) => Promise<unknown>
}

export interface GuidanceUtils {
  /** The guidance of one call; with no guide every attempt is asked exactly as the first. */
  of: <T>(guide: LlmGuide<T> | undefined, action: string, fatal?: FatalErrorResolver) => CallGuidance<T>
}
