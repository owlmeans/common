import { ResilientError } from '@owlmeans/error'

export class SdkError extends ResilientError {
  public static override typeName = `ViableSdk${ResilientError.typeName}`

  constructor(message: string = 'error') {
    super(SdkError.typeName, `viable-sdk:${message}`)
  }
}

/** The token is absent, malformed, or was refused. */
export class SdkAuthError extends SdkError {
  public static override typeName = `Auth${SdkError.typeName}`

  constructor(message: string = 'error') {
    super(`auth:${message}`)
    this.type = SdkAuthError.typeName
  }
}

/** The connector was started without something it cannot work out for itself. */
export class SdkMisconfigured extends SdkError {
  public static override typeName = `Misconfigured${SdkError.typeName}`

  constructor(message: string = 'error') {
    super(`misconfigured:${message}`)
    this.type = SdkMisconfigured.typeName
  }
}

/** A tool was called in a mode where it cannot work — a local operation on a cloud target. */
export class SdkUnsupported extends SdkError {
  public static override typeName = `Unsupported${SdkError.typeName}`

  constructor(message: string = 'error') {
    super(`unsupported:${message}`)
    this.type = SdkUnsupported.typeName
  }
}

ResilientError.registerErrorClass(SdkError)
ResilientError.registerErrorClass(SdkAuthError)
ResilientError.registerErrorClass(SdkMisconfigured)
ResilientError.registerErrorClass(SdkUnsupported)
