import { ResilientError } from '@owlmeans/error'

/**
 * The bot refusal family.
 *
 * Every message starts with `bot:` and the class's own marker (`connection-not-found:` …) — the
 * marker survives a hop where the class is not registered, so it is part of the contract. The family
 * base declares no status: a fault of the platform or the store answers 500.
 */
export class BotError extends ResilientError {
  public static override typeName: string = 'BotError'

  constructor(message: string = 'error') {
    super(BotError.typeName, `bot:${message}`)
  }
}

/** The connection does not exist — or is another scope's, which is deliberately the same answer. */
export class BotConnectionNotFound extends BotError {
  public static override typeName: string = `${BotError.typeName}ConnectionNotFound`
  public static httpStatus = 404

  constructor(message: string = 'error') {
    super(`connection-not-found:${message}`)
    this.type = BotConnectionNotFound.typeName
  }
}

/** The platform refused the credentials (or a required one is missing) at verification. */
export class BotCredentialsRejected extends BotError {
  public static override typeName: string = `${BotError.typeName}CredentialsRejected`
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`credentials-rejected:${message}`)
    this.type = BotCredentialsRejected.typeName
  }
}

/** An inbound hook whose signature (or verify token) does not prove it came from the platform. */
export class BotSignatureRejected extends BotError {
  public static override typeName: string = `${BotError.typeName}SignatureRejected`
  public static httpStatus = 401

  constructor(message: string = 'error') {
    super(`signature-rejected:${message}`)
    this.type = BotSignatureRejected.typeName
  }
}

/** The request needs the other transport — `simulate` on a live connection. */
export class BotTransportMismatch extends BotError {
  public static override typeName: string = `${BotError.typeName}TransportMismatch`
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`transport-mismatch:${message}`)
    this.type = BotTransportMismatch.typeName
  }
}

/** The platform (or the connection's credentials) cannot perform the requested action. */
export class BotUnsupportedAction extends BotError {
  public static override typeName: string = `${BotError.typeName}UnsupportedAction`
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`unsupported-action:${message}`)
    this.type = BotUnsupportedAction.typeName
  }
}

ResilientError.registerErrorClass(BotError)
ResilientError.registerErrorClass(BotConnectionNotFound)
ResilientError.registerErrorClass(BotCredentialsRejected)
ResilientError.registerErrorClass(BotSignatureRejected)
ResilientError.registerErrorClass(BotTransportMismatch)
ResilientError.registerErrorClass(BotUnsupportedAction)
