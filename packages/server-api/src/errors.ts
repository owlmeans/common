
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

/**
 * `handlers().body/params/request` was handed something it cannot serve — not a plain callback,
 * and not a `BoundEntrypointHandler` bound to the SAME protocol it is being wrapped for. Thrown
 * from inside the bound handler's own request path, so the module still loads and every OTHER
 * route on it still answers; only the misconfigured one reports why, as a 500 rather than the
 * opaque `TypeError: handler is not a function` a double wrap used to fail with. See
 * `handlers()` in `protocol.ts` for what does and does not reach here.
 */
export class HandlerMisconfiguredError extends ApiError {
  public static override typeName = 'HandlerMisconfiguredError'

  constructor(message: string = 'error') {
    super(`handler:misconfigured:${message}`)
    this.type = HandlerMisconfiguredError.typeName
  }
}

ResilientError.registerErrorClass(AuthFailedError)
ResilientError.registerErrorClass(AccessError)
ResilientError.registerErrorClass(NoFileError)
ResilientError.registerErrorClass(HandlerMisconfiguredError)

