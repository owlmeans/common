import { ResilientError } from '@owlmeans/error'

export class ApiError extends ResilientError {
  public static override typeName = 'ApiError'

  constructor(message: string = 'error') {
    super(ApiError.typeName, `api:${message}`)
  }
}

export class ApiClientError extends ApiError {
  public static override typeName = 'ApiClientError'

  constructor(message: string = 'error') {
    super(`client:${message}`)
    this.type = ApiClientError.typeName
  }
}

export class ServerCrashedError extends ApiClientError {
  public static override typeName = `${ApiClientError.typeName}ServerCrashed`

  constructor(message: string = 'error') {
    super(`crashe:${message}`)
    this.type = ServerCrashedError.typeName
  }
}

export class ServerAuthError extends ApiClientError {
  public static override typeName = `${ApiClientError.typeName}ServerAuth`

  constructor(message: string = 'error') {
    super(`auth:${message}`)
    this.type = ServerAuthError.typeName
  }
}

ResilientError.registerErrorClass(ApiError)
ResilientError.registerErrorClass(ApiClientError)
ResilientError.registerErrorClass(ServerCrashedError)
ResilientError.registerErrorClass(ServerAuthError)
