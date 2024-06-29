import { ResilientError } from './resilient'

export const enuserError = <T extends ResilientError = ResilientError>(err: Error | string, throwOnUnknown?: boolean): T =>
  ResilientError.ensure(err, throwOnUnknown) as T

export const marshalError = (err: Error | string): Error =>
  ResilientError.marshal(ResilientError.ensure(err))
