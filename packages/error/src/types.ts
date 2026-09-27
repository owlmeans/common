import type { ResilientError } from './resilient.js'

export type ValueOrError<T> = T | ResilientError

export interface MarshalErrorOptions {
  /** Defaults to true for backwards compatibility outside an HTTP boundary. */
  includeStack?: boolean
  /** Opaque correlation value appended as the fourth wire field. */
  incidentId?: string
}

export interface Converter {
  match: (err: Error) => boolean
  convert: (err: Error) => ResilientError
  isMarshaled: (err: Error) => boolean
  unmarshal: (err: Error) => ResilientError
}

export interface ResilientErrorConstructor<T extends ResilientError = ResilientError> {
  new (type: string, message: string, stack?: string): T
  new (message: string, stack?: string): T
  typeName: string
}
