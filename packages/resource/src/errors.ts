
import {  ResilientError } from '@owlmeans/error'

export class ResourceError extends ResilientError {
  public static override typeName = 'ResourceError'

  constructor(message: string = 'error') {
    super(ResilientError.typeName, `resource:${message}`)
  }
}

export class UnknownRecordError extends ResourceError {
  public static override typeName = `${ResourceError.typeName}UnknownRecordError`

  public static readonly idSeparator: string = '/'

  constructor(id: string) {
    super(`unknown-record${UnknownRecordError.idSeparator}${id}`)
  }

  get id(): string {
    return this.message.split(UnknownRecordError.idSeparator)[1]
  }
}

export class UnsupportedArgumentError extends ResourceError {
  public static override typeName = `${ResourceError.typeName}UnsupportedArgumentError`

  constructor(argument: string) {
    super(`unsupported-argument:${argument}`)
  }
}

export class UnsupportedMethodError extends ResourceError {
  public static override typeName = `${ResourceError.typeName}UnsupportedMethodError`

  constructor(method: string) {
    super(`unsupported-method:${method}`)
  }
}

ResilientError.registerErrorClass(ResourceError)
ResilientError.registerErrorClass(UnknownRecordError)
ResilientError.registerErrorClass(UnsupportedArgumentError)
ResilientError.registerErrorClass(UnsupportedMethodError)
