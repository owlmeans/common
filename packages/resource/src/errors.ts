
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

/**
 * A registered migration threw while being applied. Resource initialization aborts —
 * a structure problem has to fail the boot loudly rather than leave the process
 * running against a half-shaped database.
 */
export class MigrationError extends ResourceError {
  public static override typeName = `${ResourceError.typeName}MigrationError`

  constructor(msg: string) {
    super(`migration-failed:${msg}`)
    this.type = MigrationError.typeName
  }
}

/**
 * A migration name was registered twice with different bodies, or an already applied
 * migration's body has changed since it ran. Write a new migration instead of editing
 * one that has already been applied somewhere.
 */
export class MigrationConflict extends ResourceError {
  public static override typeName = `${ResourceError.typeName}MigrationConflict`

  constructor(msg: string) {
    super(`migration-conflict:${msg}`)
    this.type = MigrationConflict.typeName
  }
}

ResilientError.registerErrorClass(ResourceError)
ResilientError.registerErrorClass(UnknownRecordError)
ResilientError.registerErrorClass(MisshapedRecord)
ResilientError.registerErrorClass(RecordExists)
ResilientError.registerErrorClass(RecordUpdateFailed)
ResilientError.registerErrorClass(UnsupportedArgumentError)
ResilientError.registerErrorClass(UnsupportedMethodError)
ResilientError.registerErrorClass(MigrationError)
ResilientError.registerErrorClass(MigrationConflict)
