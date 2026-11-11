
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

/**
 * A streamed body (`streamBody()` route) passed its declared `maxBytes` while the handler was reading
 * it. The stream is destroyed with it, and the request answers 413 whatever the handler threw.
 */
export class StreamBodyTooLargeError extends ApiError {
  public static override typeName = 'StreamBodyTooLargeError'
  public static httpStatus = 413

  constructor(message: string = 'error') {
    super(`stream:too-large:${message}`)
    this.type = StreamBodyTooLargeError.typeName
  }
}

/**
 * A streamed body ended before it was complete — the client aborted the upload or the connection
 * broke. The handler's stream errors with it; there is nobody left to read the answer.
 */
export class StreamBodyAbortedError extends ApiError {
  public static override typeName = 'StreamBodyAbortedError'
  public static httpStatus = 400

  constructor(message: string = 'error') {
    super(`stream:aborted:${message}`)
    this.type = StreamBodyAbortedError.typeName
  }
}

ResilientError.registerErrorClass(AuthFailedError)
ResilientError.registerErrorClass(AccessError)
ResilientError.registerErrorClass(NoFileError)
ResilientError.registerErrorClass(HandlerMisconfiguredError)
ResilientError.registerErrorClass(StreamBodyTooLargeError)
ResilientError.registerErrorClass(StreamBodyAbortedError)

