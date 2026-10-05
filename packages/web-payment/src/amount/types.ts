/** A money input in a locale: its decimal separator, and cents read from / written to its text. */
export interface AmountInputHelper {
  /** The locale's decimal separator; `.` when the locale names none. */
  decimalSeparator: (locale: string) => string
  /** Parse a locale decimal directly to cents; floating-point rounding never enters the path. */
  parseAmountMinor: (input: string, locale: string) => number | null
  /** Cents as the text of a money input in the locale (`12,50`). */
  inputAmount: (amountMinor: number, locale: string) => string
}
