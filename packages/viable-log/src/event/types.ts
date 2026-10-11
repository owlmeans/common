import type { TargetEvent } from '../types.js'

/** The stdout line protocol a target's backend speaks to the platform's publisher. */
export interface TargetEventHelper {
  /** The stdout line of an event. Over-long ones lose their stack, then their data — never their head. */
  targetEventLine: (event: TargetEvent) => string
  /**
   * The event a stdout line carries, or `undefined` when the line is not one — absent marker, broken
   * JSON, unknown version, or a shape the platform does not accept. The input is untrusted: it is
   * written by generated code, and nothing outside this function may read fields of it unchecked.
   */
  parseTargetEventLine: (line: string) => TargetEvent | undefined
}
