import type { ResilientError } from '../errors.js'

/** Boundary shortcuts over `ResilientError.ensure` and `ResilientError.marshal`. */
export interface ErrorHelper {
  /** `ResilientError.ensure`, typed to the subclass the caller expects. */
  enuserError: <T extends ResilientError = ResilientError>(err: Error | string, throwOnUnknown?: boolean) => T
  /** `ensure` then `marshal`, for a boundary that only carries an `Error` or a string. */
  marshalError: (err: Error | string) => Error
}
