
import { ApiError } from '@owlmeans/api'
import { ResilientError } from '@owlmeans/error'

export class AuthFailedError extends ApiError {
  public static override typeName = 'AuthFailedError'

  constructor(message: string = 'error') {
    super(`auth:${message}`)
  }
}

export class AccessError extends ApiError {
  public static override typeName = `Access${AuthFailedError.typeName}`

  constructor(message: string = 'error') {
    super(`access:${message}`)
  }
}

ResilientError.registerErrorClass(AuthFailedError)
ResilientError.registerErrorClass(AccessError)
