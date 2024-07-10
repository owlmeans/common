
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

export class MisshapedRecord extends ResourceError {
  public static override typeName = `${ResourceError.typeName}MisshapedRecord`

  constructor(msg: string) {
    super(`misshaped-record:${msg}`)
  }
}

export class RecordExists extends ResourceError {
  public static override typeName = `${ResourceError.typeName}RecordExists`

  constructor(msg: string) {
    super(`record-exists:${msg}`)
  }
}

export class RecordUpdateFailed extends ResourceError {
  public static override typeName = `${ResourceError.typeName}RecordUpdateFailed`

  constructor(msg: string) {
    super(`record-update-failed:${msg}`)
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
ResilientError.registerErrorClass(MisshapedRecord)
ResilientError.registerErrorClass(RecordExists)
ResilientError.registerErrorClass(RecordUpdateFailed)
ResilientError.registerErrorClass(UnsupportedArgumentError)
ResilientError.registerErrorClass(UnsupportedMethodError)
