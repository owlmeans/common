import { RESILENT_ERROR, SEPARATOR } from './consts.js'
import type { Converter, ResilientErrorConstructor } from './types.js'
import { createErrorConverter } from './utils.js'

export class ResilientError extends Error {
  public static separator: string = SEPARATOR

  public static typeName: string = RESILENT_ERROR

  public static converters: Converter[] = []

  public static registerErrorClass(resilientErrorClass: ResilientErrorConstructor, errorClass?: ErrorConstructor): Converter {
    const converter = createErrorConverter(resilientErrorClass, errorClass)
    this.converters.push(converter)

    return converter
  }

  public static ensure(err: Error | string, throwOnUnknown?: boolean): ResilientError {
    err = typeof err === 'string' ? new Error(err) : err
    if (err instanceof ResilientError) {
      return err
    }

    // Umarshal marhalled error that is wrapepd to ordinary error
    const unmarhaller = this.converters.toReversed().find(converter => converter.isMarshaled(err))
    if (unmarhaller != null) {
      return unmarhaller.unmarshal(err)
    }

    // Convert object of Error subtypes to ResilientError subtype
    const converter = this.converters.find(converter => converter.match(err))
    if (converter != null) {
      return converter.convert(err)
    }

    if (throwOnUnknown === true) {
      throw err
    }

    return new ResilientError(this.typeName, err.message, err.stack)
  }

  public static marshal(err: Error): Error {
    if (err instanceof ResilientError) {
      return new Error([err.type, err.message, err.oiriginalStack].join(this.separator))
    }

    return new Error([this.typeName, err.message, err.stack].join(this.separator))
  }

  public type: string = RESILENT_ERROR

  public oiriginalStack?: string

  constructor(type: string, message: string, stack?: string) {
    super(message)
    this.type = type
    if (stack != null) {
      this.oiriginalStack = stack
    } else {
      this.oiriginalStack = this.stack
    }
  }

  marshal(): Error {
    return ResilientError.marshal(this)
  }

  finalizeUnmarshal(): void { }
}

ResilientError.converters.push({
  ...createErrorConverter(ResilientError as ResilientErrorConstructor),
  match: () => true
})
