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
  /** The addressed session is absent or another profile's: answered 404. */
  public static httpStatus = 404

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
  /** The project has no connector attached: answered 409. */
  public static httpStatus = 409

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
  /** The connector refused the operation it was handed: answered 422. */
  public static httpStatus = 422

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
  /** The project's local target cannot serve the operation: answered 409. */
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`local-unsupported:${message}`)
    this.type = LocalSlotUnsupported.typeName
  }
}

/** The op id is unknown, already answered, or belongs to another session. */
export class ConnectOpUnknown extends ConnectError {
  public static override typeName = `OpUnknown${ConnectError.typeName}`
  /** The addressed operation is absent, answered or another session's: answered 404. */
  public static httpStatus = 404

  constructor(message: string = 'error') {
    super(`op-unknown:${message}`)
    this.type = ConnectOpUnknown.typeName
  }
}

/**
 * The organization cannot pay for the action a connector just asked for.
 *
 * Only `type` and `message` survive a marshal/unmarshal round trip, so the fields a caller needs
 * to phrase a kind refusal — which action, how short, and where to top up — travel packed into the
 * message and are parsed back out in `finalizeUnmarshal()`. The URL is `encodeURIComponent`-ed
 * because it is the one field that could itself contain a colon.
 */
export class ConnectOutOfCredits extends ConnectError {
  public static override typeName = `OutOfCredits${ConnectError.typeName}`
  /** The organization's balance, not a fault: answered 402. */
  public static httpStatus = 402

  public gate = ''
  public requiredUsd = 0
  public balanceUsd = 0
  public topUpUrl = ''

  /** Build the packed message a caller passes to the constructor. */
  static encode(gate: string, requiredUsd: number, balanceUsd: number, topUpUrl: string): string {
    return `${gate}:${requiredUsd}:${balanceUsd}:${encodeURIComponent(topUpUrl)}`
  }

  constructor(message: string = 'error') {
    super(`out-of-credits:${message}`)
    this.type = ConnectOutOfCredits.typeName
    this.applyFields()
  }

  private applyFields(): void {
    const marker = 'out-of-credits:'
    const at = this.message.indexOf(marker)
    if (at < 0) return
    const [gate, requiredUsd, balanceUsd, encodedUrl] = this.message.slice(at + marker.length).split(':')
    this.gate = gate ?? ''
    this.requiredUsd = Number(requiredUsd ?? 0) || 0
    this.balanceUsd = Number(balanceUsd ?? 0) || 0
    this.topUpUrl = encodedUrl != null && encodedUrl !== '' ? decodeURIComponent(encodedUrl) : ''
  }

  override finalizeUnmarshal(): void {
    this.applyFields()
  }
}

/**
 * The action would spend credits bought less than 14 days ago under EU consumer rules, and a person
 * has not yet expressly asked the platform to start using them (the purchase can still be
 * withdrawn from). Only a person can give that request — in the browser, at `consentUrl`.
 *
 * Packed like `ConnectOutOfCredits`, because only `type` and `message` survive a marshal:
 * `consent-required:<gate>:<deadline epoch ms | 0>:<encodeURIComponent(consentUrl)>`. The deadline
 * is epoch milliseconds and the URL goes last, because an ISO date and a URL both contain colons.
 */
export class ConnectConsentRequired extends ConnectError {
  public static override typeName = `ConsentRequired${ConnectError.typeName}`
  /** A precondition only a person can meet, not a fault: answered 428. */
  public static httpStatus = 428

  public gate = ''
  /** The latest withdrawal deadline of the purchases waiting for consent, when known. */
  public deadline?: Date
  public consentUrl = ''

  /** Build the packed message a caller passes to the constructor. */
  static encode(gate: string, consentUrl: string, deadline?: Date | null): string {
    const at = deadline != null && !Number.isNaN(deadline.getTime()) ? deadline.getTime() : 0

    return `${gate}:${at}:${encodeURIComponent(consentUrl)}`
  }

  constructor(message: string = 'error') {
    super(`consent-required:${message}`)
    this.type = ConnectConsentRequired.typeName
    this.applyFields()
  }

  private applyFields(): void {
    const marker = 'consent-required:'
    const at = this.message.lastIndexOf(marker)
    if (at < 0) return
    const [gate, deadline, encodedUrl] = this.message.slice(at + marker.length).split(':')
    this.gate = gate ?? ''
    const ms = Number(deadline ?? 0)
    this.deadline = Number.isFinite(ms) && ms > 0 ? new Date(ms) : undefined
    let url = ''
    try {
      url = encodedUrl != null && encodedUrl !== '' ? decodeURIComponent(encodedUrl) : ''
    } catch {
      url = encodedUrl ?? ''
    }
    this.consentUrl = url
  }

  override finalizeUnmarshal(): void {
    this.applyFields()
  }
}

ResilientError.registerErrorClass(ConnectError)
ResilientError.registerErrorClass(ConnectSessionNotFound)
ResilientError.registerErrorClass(ConnectSessionGone)
ResilientError.registerErrorClass(ConnectOpTimeout)
ResilientError.registerErrorClass(ConnectOpRefused)
ResilientError.registerErrorClass(LocalSlotUnsupported)
ResilientError.registerErrorClass(ConnectOpUnknown)
ResilientError.registerErrorClass(ConnectOutOfCredits)
ResilientError.registerErrorClass(ConnectConsentRequired)
