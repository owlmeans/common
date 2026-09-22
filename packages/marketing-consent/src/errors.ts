import { ResilientError } from '@owlmeans/error'

/** The marketing-consent error family — refusals a status/save/terms handler raises. */
export class MarketingConsentError extends ResilientError {
  public static override typeName: string = 'MarketingConsentError'

  constructor(message: string = 'error') {
    super(MarketingConsentError.typeName, `marketing-consent:${message}`)
  }
}

/** A `SaveMarketingConsentRequest` decision named a key that no resolved definition carries. */
export class UnknownMarketingConsentError extends MarketingConsentError {
  public static override typeName: string = `${MarketingConsentError.typeName}Unknown`
  /** A bad request, not a server fault — the caller named a key this deployment does not have. */
  public static httpStatus = 400

  constructor(message: string = 'error') {
    super(`unknown:${message}`)
    this.type = UnknownMarketingConsentError.typeName
  }
}

ResilientError.registerErrorClass(MarketingConsentError)
ResilientError.registerErrorClass(UnknownMarketingConsentError)
