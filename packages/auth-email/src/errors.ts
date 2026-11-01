import { ResilientError } from '@owlmeans/error'

/**
 * The e-mail sign-in error family, shared by the server that throws and the client that reads it
 * back (each class is registered, so it survives the wire). A failed PIN or password check is
 * `AuthenFailed` from `@owlmeans/auth`, never one of these: no answer here may tell an unknown
 * address from a wrong credential.
 */
export class EmailAuthError extends ResilientError {
  public static override typeName: string = 'EmailAuthError'

  constructor(message: string = 'error') {
    super(EmailAuthError.typeName, `auth-email:${message}`)
  }
}

/** A password sign-in or a password route on a deployment that does not offer passwords. */
export class EmailPasswordDisabled extends EmailAuthError {
  public static override typeName: string = `${EmailAuthError.typeName}PasswordDisabled`
  public static httpStatus = 404

  constructor(message: string = 'password') {
    super(`disabled:${message}`)
    this.type = EmailPasswordDisabled.typeName
  }
}

/** A new password the policy refuses (length bounds); the message names the rule. */
export class EmailPasswordWeak extends EmailAuthError {
  public static override typeName: string = `${EmailAuthError.typeName}PasswordWeak`
  public static httpStatus = 422

  constructor(message: string = 'length') {
    super(`weak:${message}`)
    this.type = EmailPasswordWeak.typeName
  }
}

/** The one-use offer ticket is spent, expired or another account's — confirm with a PIN instead. */
export class EmailOfferExpired extends EmailAuthError {
  public static override typeName: string = `${EmailAuthError.typeName}OfferExpired`
  public static httpStatus = 409

  constructor(message: string = 'offer') {
    super(`expired:${message}`)
    this.type = EmailOfferExpired.typeName
  }
}

/** A developer (tech) route on a deployment where they are off: answers as if it did not exist. */
export class EmailTechDisabled extends EmailAuthError {
  public static override typeName: string = `${EmailAuthError.typeName}TechDisabled`
  public static httpStatus = 404

  constructor(message: string = 'tech') {
    super(`disabled:${message}`)
    this.type = EmailTechDisabled.typeName
  }
}

/** A store, mailer or captcha authority could not be consulted, so the request fails closed. */
export class EmailAuthUnavailable extends EmailAuthError {
  public static override typeName: string = `${EmailAuthError.typeName}Unavailable`
  public static httpStatus = 503
  public static allowServerErrorStatus = true

  constructor(message: string = 'unavailable') {
    super(`unavailable:${message}`)
    this.type = EmailAuthUnavailable.typeName
  }
}

ResilientError.registerErrorClass(EmailAuthError)
ResilientError.registerErrorClass(EmailPasswordDisabled)
ResilientError.registerErrorClass(EmailPasswordWeak)
ResilientError.registerErrorClass(EmailOfferExpired)
ResilientError.registerErrorClass(EmailTechDisabled)
ResilientError.registerErrorClass(EmailAuthUnavailable)
