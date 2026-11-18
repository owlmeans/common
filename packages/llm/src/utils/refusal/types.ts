import type { ErrorObject } from 'ajv'
import type { LlmSchemaRejection } from '../../errors.js'

/** Reading a refused answer: what the schema said about it, and what the next attempt is told. */
export interface RefusalUtils {
  /**
   * The error a schema refusal is thrown as: `validation-failed:` and the first errors in the
   * message, every error on `details`, the first on `cause`.
   */
  rejectionOf: (errors: readonly ErrorObject[]) => LlmSchemaRejection
  /**
   * What makes two schema refusals THE SAME: every distinct `instancePath|keyword|detail` (the
   * missing or extra property, the allowed values), sorted — never the refused values themselves.
   */
  signatureOf: (errors: readonly ErrorObject[]) => string
  /**
   * The JSON pointer each error is about, deduplicated in order: a missing or an extra property is
   * named by its own path (`<instancePath>/<property>`), not by the object that holds it.
   */
  pathsOf: (errors: readonly ErrorObject[]) => string[]
  /** {@link pathsOf} for one error, as unescaped pointer segments. */
  segmentsOf: (error: ErrorObject) => string[]
  /** Unescaped pointer segments as a JSON pointer (`/a/b~1c`); `''` for the root. */
  pointerOf: (segments: readonly string[]) => string
  /** The value at the given pointer segments, or `undefined` when the answer has none there. */
  valueAt: (value: unknown, segments: readonly string[]) => unknown
  /**
   * The default correction after a schema refusal that no guide corrected: up to
   * {@link MAX_CORRECTION_ERRORS} errors with their path, rule and the refused fragment at that path,
   * then the order to return the whole answer corrected.
   */
  correctionOf: (errors: readonly ErrorObject[], value: unknown) => string
  /**
   * Why an attempt was refused, without the model's content: `filter-rejected[:<reason>]` (an
   * `LlmOutputRejection`'s own reason, else the thrown error's name) or
   * `validation-failed:<path> <rule> <detail>` for the first schema error.
   */
  reasonOf: (error: unknown) => string
}
