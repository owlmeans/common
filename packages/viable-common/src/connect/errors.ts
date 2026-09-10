import { ResilientError } from '@owlmeans/error'

export class ConnectError extends ResilientError {
  public static override typeName = `ViableConnect${ResilientError.typeName}`

  constructor(message: string = 'error') {
    super(ConnectError.typeName, `viable-connect:${message}`)
  }
}

/** No session with that id, or it belongs to another profile. */
export class ConnectSessionNotFound extends ConnectError {
  public static override typeName = `SessionNotFound${ConnectError.typeName}`

  constructor(message: string = 'error') {
    super(`session-not-found:${message}`)
    this.type = ConnectSessionNotFound.typeName
  }
}

/**
 * Nothing is attached to the project, and the operation needs a connector.
 *
 * FATAL by registration on the agent side: a run whose executor has gone away must stop at once
 * rather than spend a retry ladder — the library retries a template write three times, the coder
 * retries eight, and a model call retries eight inside that, so an unrecognised failure here costs
 * minutes of nothing and a project lock held throughout. The step fails as an OUTCOME, the run row
 * records where it stopped, and `pipeline.resume` picks it up when a connector returns.
 */
export class ConnectSessionGone extends ConnectError {
  public static override typeName = `SessionGone${ConnectError.typeName}`

  constructor(message: string = 'error') {
    super(`session-gone:${message}`)
    this.type = ConnectSessionGone.typeName
  }
}

/** The connector did not answer within the command's own deadline. Retryable. */
export class ConnectOpTimeout extends ConnectError {
  public static override typeName = `OpTimeout${ConnectError.typeName}`

  constructor(message: string = 'error') {
    super(`op-timeout:${message}`)
    this.type = ConnectOpTimeout.typeName
  }
}

/** The connector executed the operation and refused it — a path outside the project, say. */
export class ConnectOpRefused extends ConnectError {
  public static override typeName = `OpRefused${ConnectError.typeName}`

  constructor(message: string = 'error') {
    super(`op-refused:${message}`)
    this.type = ConnectOpRefused.typeName
  }
}

/**
 * The operation is meaningless for a local slot.
 *
 * Sandbox lifecycle, production, preview watching and remote git all address infrastructure a
 * local target does not have. Refusing by name is what keeps a connector's tool list honest: the
 * tool is hidden where it cannot work, and the API says so if one is called anyway.
 */
export class LocalSlotUnsupported extends ConnectError {
  public static override typeName = `LocalUnsupported${ConnectError.typeName}`

  constructor(message: string = 'error') {
    super(`local-unsupported:${message}`)
    this.type = LocalSlotUnsupported.typeName
  }
}

/** The op id is unknown, already answered, or belongs to another session. */
export class ConnectOpUnknown extends ConnectError {
  public static override typeName = `OpUnknown${ConnectError.typeName}`

  constructor(message: string = 'error') {
    super(`op-unknown:${message}`)
    this.type = ConnectOpUnknown.typeName
  }
}

ResilientError.registerErrorClass(ConnectError)
ResilientError.registerErrorClass(ConnectSessionNotFound)
ResilientError.registerErrorClass(ConnectSessionGone)
ResilientError.registerErrorClass(ConnectOpTimeout)
ResilientError.registerErrorClass(ConnectOpRefused)
ResilientError.registerErrorClass(LocalSlotUnsupported)
ResilientError.registerErrorClass(ConnectOpUnknown)
