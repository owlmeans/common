
import {  ResilientError } from '@owlmeans/error'

export class ResourceError extends ResilientError {
  public static override typeName = 'ResourceError'

  constructor(message: string = 'error') {
    super(ResourceError.typeName, `resource:${message}`)
  }
}

export class UnknownRecordError extends ResourceError {
  public static override typeName = `${ResourceError.typeName}UnknownRecordError`

  public static readonly idSeparator: string = '/'

  constructor(id: string) {
    super(`unknown-record${UnknownRecordError.idSeparator}${id}`)
    this.type = UnknownRecordError.typeName
  }

  get id(): string {
    return this.message.split(UnknownRecordError.idSeparator)[1]
  }
}

export class MisshapedRecord extends ResourceError {
  public static override typeName = `${ResourceError.typeName}MisshapedRecord`

  constructor(msg: string) {
    super(`misshaped-record:${msg}`)
    this.type = MisshapedRecord.typeName
  }
}

export class RecordExists extends ResourceError {
  public static override typeName = `${ResourceError.typeName}RecordExists`

  constructor(msg: string) {
    super(`record-exists:${msg}`)
    this.type = RecordExists.typeName
  }
}

export class RecordUpdateFailed extends ResourceError {
  public static override typeName = `${ResourceError.typeName}RecordUpdateFailed`

  constructor(msg: string) {
    super(`record-update-failed:${msg}`)
    this.type = RecordUpdateFailed.typeName
  }
}

export class UnsupportedArgumentError extends ResourceError {
  public static override typeName = `${ResourceError.typeName}UnsupportedArgumentError`

  constructor(argument: string) {
    super(`unsupported-argument:${argument}`)
    this.type = UnsupportedArgumentError.typeName
  }
}

export class UnsupportedMethodError extends ResourceError {
  public static override typeName = `${ResourceError.typeName}UnsupportedMethodError`

  constructor(method: string) {
    super(`unsupported-method:${method}`)
    this.type = UnsupportedMethodError.typeName
  }
}

ResilientError.registerErrorClass(ResourceError)
ResilientError.registerErrorClass(UnknownRecordError)
ResilientError.registerErrorClass(MisshapedRecord)
ResilientError.registerErrorClass(RecordExists)
ResilientError.registerErrorClass(RecordUpdateFailed)
ResilientError.registerErrorClass(UnsupportedArgumentError)
ResilientError.registerErrorClass(UnsupportedMethodError)
