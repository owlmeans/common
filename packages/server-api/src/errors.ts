
import { ApiError } from '@owlmeans/api'
import { ResilientError } from '@owlmeans/error'

export class AuthFailedError extends ApiError {
  public static override typeName = 'AuthFailedError'

  constructor(message: string = 'error') {
    super(`auth:${message}`)
    this.type = AuthFailedError.typeName
  }
}

export class AccessError extends ApiError {
  public static override typeName = `Access${AuthFailedError.typeName}`

  constructor(message: string = 'error') {
    super(`access:${message}`)
    this.type = AccessError.typeName
  }
}

export class NoFileError extends ApiError {
  public static override typeName = 'NoFileError'

  constructor() {
    super('no file')
    this.type = NoFileError.typeName
  }
}

ResilientError.registerErrorClass(AuthFailedError)
ResilientError.registerErrorClass(AccessError)
ResilientError.registerErrorClass(NoFileError)

