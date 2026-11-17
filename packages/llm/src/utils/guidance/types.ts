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
   * replaces the previous). A schema refusal ({@link LlmSchemaRejection}) the guide does not correct
   * — no guide, `null`, or a guide that throws — gets the default correction, quoting the refused
   * fragments from `validated` (the value the schema refused; `output` unless given — `request`
   * validates its message's JSON). Answers the error, so the attempt throws it: `throw await refused(…)`.
   */
  refused: (error: unknown, attempt: number, output: T, validated?: unknown) => Promise<unknown>
}

export interface GuidanceUtils {
  /**
   * The guidance of one call. With no guide, a filter-refused attempt is asked exactly as the first
   * and a schema-refused one with the default correction.
   */
  of: <T>(guide: LlmGuide<T> | undefined, action: string, fatal?: FatalErrorResolver) => CallGuidance<T>
}
