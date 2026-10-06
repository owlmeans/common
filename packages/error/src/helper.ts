import { ResilientError } from './errors.js'
import type { ErrorHelper } from './helper/types.js'

export const createErrorHelper = (): ErrorHelper => {
  const enuserError = <T extends ResilientError = ResilientError>(err: Error | string, throwOnUnknown?: boolean): T =>
    ResilientError.ensure(err, throwOnUnknown) as T

  const marshalError = (err: Error | string): Error =>
    ResilientError.marshal(ResilientError.ensure(err))

  return { enuserError, marshalError }
}

export const errorHelper = createErrorHelper()
