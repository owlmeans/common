import { ResilientError } from '@owlmeans/error'
import { UploadReason } from './consts.js'

/** The upload family — `upload:<area>:<detail>`. */
export class UploadError extends ResilientError {
  public static override typeName: string = 'UploadError'

  constructor(message: string = 'error') {
    super(UploadError.typeName, `upload:${message}`)
  }
}

/** No session under this id — or one another owner opened (never told apart). */
export class UploadSessionNotFoundError extends UploadError {
  public static override typeName: string = `${UploadError.typeName}SessionNotFound`
  public static httpStatus = 404

  constructor(message: string = 'error') {
    super(`session-not-found:${message}`)
    this.type = UploadSessionNotFoundError.typeName
  }
}

/** The session's status forbids the operation: a file for a sealed session, an abort after a seal. */
export class UploadSessionStateError extends UploadError {
  public static override typeName: string = `${UploadError.typeName}SessionState`
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`session-state:${message}`)
    this.type = UploadSessionStateError.typeName
  }
}

/** An announcement (`open`'s `expect`) that cannot fit the policy. */
export class UploadLimitError extends UploadError {
  public static override typeName: string = `${UploadError.typeName}Limit`
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`limits:${message}`)
    this.type = UploadLimitError.typeName
  }
}

/** A request the upload surface cannot take — a session id that is not one path segment. */
export class UploadRequestError extends UploadError {
  public static override typeName: string = `${UploadError.typeName}Request`
  public static httpStatus = 400

  constructor(message: string = 'error') {
    super(`request:${message}`)
    this.type = UploadRequestError.typeName
  }
}

/** A policy that is not one (a limit that is not a positive integer). A fault of the application. */
export class UploadPolicyError extends UploadError {
  public static override typeName: string = `${UploadError.typeName}Policy`

  constructor(message: string = 'error') {
    super(`policy:${message}`)
    this.type = UploadPolicyError.typeName
  }
}

/**
 * A file refused with a vocabulary reason — what a receiver throws when the place a file goes refuses
 * it (another service rejected it, a name is taken there). The session records it as rejected.
 */
export class UploadRejectedError extends UploadError {
  public static override typeName: string = `${UploadError.typeName}Rejected`
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`rejected:${message}`)
    this.type = UploadRejectedError.typeName
  }

  /** The reason, read back from the message (it survives marshalling). */
  public get reason(): UploadReason {
    const value = this.message.replace(/^.*upload:rejected:/, '')
    return (Object.values(UploadReason) as string[]).includes(value) ? value as UploadReason : UploadReason.RefusedKind
  }
}

ResilientError.registerErrorClass(UploadError)
ResilientError.registerErrorClass(UploadSessionNotFoundError)
ResilientError.registerErrorClass(UploadSessionStateError)
ResilientError.registerErrorClass(UploadLimitError)
ResilientError.registerErrorClass(UploadRequestError)
ResilientError.registerErrorClass(UploadPolicyError)
ResilientError.registerErrorClass(UploadRejectedError)
