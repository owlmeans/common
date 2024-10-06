import { ResilientError } from './resilient.js'
import type { Converter, ResilientErrorConstructor } from './types.js'

export const createErrorConverter = (
  resilientErrorClass: ResilientErrorConstructor,
  errorClass?: ErrorConstructor
): Converter => {
  return {
    match: err => errorClass != null && err instanceof errorClass,
    convert: err => new resilientErrorClass(err.message, err.stack),
    isMarshaled: err => err.message.startsWith(resilientErrorClass.typeName + ResilientError.separator),
    unmarshal: unmarshal(resilientErrorClass)
  }
}

export const unmarshal = <T extends ResilientError = ResilientError>(errorClass: ResilientErrorConstructor) =>
  (err: Error): T => {
    if (err instanceof errorClass) {
      return err as T
    }
    const args = err.message.split(ResilientError.separator, 3) as [string, string, string?]
    if (args.length < 2) {
      throw SyntaxError('Invalid marshaled error')
    }

    if (args[0] === errorClass.typeName) {
      args.shift()
    }

    const error = new errorClass(...args)
    error.finalizeUnmarshal()
    return error as T
  }
