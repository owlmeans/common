import { BotError } from '@owlmeans/bot'
import { ResilientError } from '@owlmeans/error'

/**
 * The server's own refusals, in the `@owlmeans/bot` family (`bot:<marker>:<detail>`). The contract's
 * classes (`BotConnectionNotFound`, `BotCredentialsRejected`, `BotSignatureRejected`,
 * `BotTransportMismatch`, `BotUnsupportedAction`) cover the rest.
 */

/** The rule does not exist — or is another scope's, which is deliberately the same answer. */
export class BotRuleNotFound extends BotError {
  public static override typeName: string = `${BotError.typeName}RuleNotFound`
  public static httpStatus = 404

  constructor(message: string = 'error') {
    super(`rule-not-found:${message}`)
    this.type = BotRuleNotFound.typeName
  }
}

/** A rule write that is understood and refused (no keyword left after normalization). */
export class BotRuleInvalid extends BotError {
  public static override typeName: string = `${BotError.typeName}RuleInvalid`
  public static httpStatus = 422

  constructor(message: string = 'error') {
    super(`rule-invalid:${message}`)
    this.type = BotRuleInvalid.typeName
  }
}

/** The connection is switched off — a simulated message is not taken. */
export class BotConnectionDisabled extends BotError {
  public static override typeName: string = `${BotError.typeName}ConnectionDisabled`
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`connection-disabled:${message}`)
    this.type = BotConnectionDisabled.typeName
  }
}

/**
 * No secret to seal credentials with (`APP_SECRET` unset and no `secret` option) — a deployment
 * fault, so no status: it answers 500. Credentials are never stored in the clear.
 */
export class BotSecretMissing extends BotError {
  public static override typeName: string = `${BotError.typeName}SecretMissing`

  constructor(message: string = 'APP_SECRET') {
    super(`secret-missing:${message}`)
    this.type = BotSecretMissing.typeName
  }
}

/** Sealed credentials that do not open with this deployment's secret — tampered, or another key. */
export class BotCredentialsUnreadable extends BotError {
  public static override typeName: string = `${BotError.typeName}CredentialsUnreadable`

  constructor(message: string = 'error') {
    super(`credentials-unreadable:${message}`)
    this.type = BotCredentialsUnreadable.typeName
  }
}

ResilientError.registerErrorClass(BotRuleNotFound)
ResilientError.registerErrorClass(BotRuleInvalid)
ResilientError.registerErrorClass(BotConnectionDisabled)
ResilientError.registerErrorClass(BotSecretMissing)
ResilientError.registerErrorClass(BotCredentialsUnreadable)
