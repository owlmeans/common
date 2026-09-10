import { ResilientError } from '@owlmeans/error'

export class InquiryError extends ResilientError {
  public static override typeName = `Inquiry${ResilientError.typeName}`

  constructor(message: string = 'error') {
    super(InquiryError.typeName, `inquiry:${message}`)
  }
}

/**
 * No transport is seated under this key, or the one that was has gone.
 *
 * FATAL, and registered as such beside the throw. Nothing above it can improve by trying again:
 * every retry ladder in the stack exists for a performer that answered badly, and there is nobody
 * to ask. Left unrecognised, an absent channel costs an agent its whole turn budget on a tool it
 * will never get an answer from.
 */
export class InquiryUnavailable extends InquiryError {
  public static override typeName = `Unavailable${InquiryError.typeName}`

  constructor(message: string = 'error') {
    super(`unavailable:${message}`)
    this.type = InquiryUnavailable.typeName
  }
}

/**
 * Nobody may be asked (policy `refuse`), or the answerer refused to decide.
 *
 * NOT retryable either, and deliberately a different class from {@link InquiryUnavailable}: a
 * channel that answered "I will not decide this" is working. Whoever asked must decide itself and
 * record the assumption, rather than treat the run as broken.
 */
export class InquiryDeclined extends InquiryError {
  public static override typeName = `Declined${InquiryError.typeName}`

  constructor(message: string = 'error') {
    super(`declined:${message}`)
    this.type = InquiryDeclined.typeName
  }
}

ResilientError.registerErrorClass(InquiryError)
ResilientError.registerErrorClass(InquiryUnavailable)
ResilientError.registerErrorClass(InquiryDeclined)
