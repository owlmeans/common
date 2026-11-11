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

/**
 * A platform's API refused a call or failed — `bot:platform:<platform id>:<detail>`, the detail as the
 * platform's plugin states it (its codes first, then the platform's own words).
 *
 * The ONE wire class of every platform: a plugin's own error class extends it WITHOUT declaring a
 * type name of its own, so a refusal that crossed the wire is rebuilt as this class wherever the
 * plugin is not loaded (a browser, another service). No status: the platform's fault answers 500.
 */
export class BotErrorPlatform extends BotError {
  public static override typeName: string = `${BotError.typeName}Platform`

  /** The refusal of `platform`, its detail as the plugin states it. */
  public static of(platform: string, detail: string): BotErrorPlatform {
    return new BotErrorPlatform(`${platform}:${detail}`)
  }

  /** The platform id the refusal came from (`''` when the message names none). */
  public platform: string = ''
  /** What the platform said, after its id. */
  public detail: string = ''

  /** `message` is `<platform id>:<detail>` — prefer {@link BotErrorPlatform.of}. */
  constructor(message: string = 'unknown:error') {
    super(`platform:${message}`)
    this.type = BotErrorPlatform.typeName
    this.readPlatform()
  }

  /** Platform and detail are read back from the message — also for an error rebuilt on the far side of a hop. */
  public override finalizeUnmarshal(): void {
    this.readPlatform()
  }

  private readPlatform(): void {
    const found = /^bot:platform:([^:]*)(?::([\s\S]*))?$/.exec(this.message)
    this.platform = found?.[1] ?? ''
    this.detail = found?.[2] ?? ''
  }
}

ResilientError.registerErrorClass(BotError)
ResilientError.registerErrorClass(BotConnectionNotFound)
ResilientError.registerErrorClass(BotCredentialsRejected)
ResilientError.registerErrorClass(BotSignatureRejected)
ResilientError.registerErrorClass(BotTransportMismatch)
ResilientError.registerErrorClass(BotUnsupportedAction)
ResilientError.registerErrorClass(BotErrorPlatform)
