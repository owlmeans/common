import { ResilientError } from '@owlmeans/error'

export class ApiError extends ResilientError {
  public static override typeName = 'ApiError'

  constructor(message: string = 'error') {
    super(ResilientError.typeName, `api:${message}`)
  }
}

ResilientError.registerErrorClass(ApiError)
