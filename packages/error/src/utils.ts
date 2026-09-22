import { ResilientError } from './resilient.js'
import type { Converter, ResilientErrorConstructor } from './types.js'

export const createErrorConverter = (
  resilientErrorClass: ResilientErrorConstructor,
  errorClass?: ErrorConstructor
): Converter => {
  return {
    match: err => errorClass != null && err instanceof errorClass,
    convert: err => new resilientErrorClass(err.message, err.stack),
    isMarshaled: err =>
      err.message.startsWith(resilientErrorClass.typeName + ResilientError.separator),
    unmarshal: unmarshal(resilientErrorClass)
  }
}

export const unmarshal = <T extends ResilientError = ResilientError>(errorClass: ResilientErrorConstructor) =>
  (err: Error): T => {
    if (err instanceof errorClass) {
      return err as T
    }
    const fields = err.message.split(ResilientError.separator, 4)
    if (fields.length < 2) {
      throw SyntaxError('Invalid marshaled error')
    }
    const [type, message, stack, incidentId] = fields
    // The base constructor takes (type, message, stack); subclasses take (message, stack).
    // Keeping the base's wire type in place avoids shifting a plain Error's message into `type`.
    const error = errorClass === ResilientError
      ? new errorClass(type, message, stack)
      : new errorClass(message, stack)
    error.type = type
    error.message = message
    error.incidentId = incidentId
    error.finalizeUnmarshal()
    return error as T
  }
