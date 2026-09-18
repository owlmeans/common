import { ResilientError } from '@owlmeans/error'

export class OtpError extends ResilientError {
  public static override typeName = 'OtpError'

  constructor(message: string = 'error') {
    super(OtpError.typeName, `otp:${message}`)
  }
}

export class OtpThrottled extends OtpError {
  public static override typeName = `${OtpError.typeName}Throttled`
  public static httpStatus = 429
  public readonly retryAfter: number

  constructor(retryAfter: number | string = 1, stack?: string) {
    super(typeof retryAfter === 'string' ? retryAfter : 'throttled')
    this.type = OtpThrottled.typeName
    this.retryAfter = typeof retryAfter === 'number' ? Math.max(1, Math.ceil(retryAfter)) : 1
    if (stack != null) this.oiriginalStack = stack
  }
}

export class OtpUnavailable extends OtpError {
  public static override typeName = `${OtpError.typeName}Unavailable`
  public static httpStatus = 503
  public static allowServerErrorStatus = true

  constructor(message: string = 'store') {
    super(`unavailable:${message}`)
    this.type = OtpUnavailable.typeName
  }
}

ResilientError.registerErrorClass(OtpError)
ResilientError.registerErrorClass(OtpThrottled)
ResilientError.registerErrorClass(OtpUnavailable)
