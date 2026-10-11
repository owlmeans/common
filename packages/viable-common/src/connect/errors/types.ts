

/** The conversion verb a {@link ConnectConfirmationRequired} stopped. */
export type ConnectConfirmationAction = 'convert-start' | 'convert-proceed'

/**
 * What a person is asked to agree to before a conversion verb spends anything — credits, except
 * `moneyUsd`. `cap` is the plan's conversion limit this conversion runs under (`0` when no plan unit
 * covers it) and `spent` what the conversion has used of it so far; `estimate` is the stage's
 * estimate (`0` while nothing has priced it), of which `fromAllowance` comes from the conversion
 * limit, `fromCreditLimits` from the organization's open credit limits, and the rest from topped-up
 * credits — `moneyUsd`, the only money figure.
 */
export interface ConnectConfirmation {
  action: ConnectConfirmationAction
  cap: number
  spent: number
  estimate: number
  fromAllowance: number
  fromCreditLimits: number
  moneyUsd: number
}
