/** How the consumer-rights flows write and read references, addresses, amounts and dates — pure. */
export interface ConsumerFormatHelper {
  /** `CR-YYMMDD-XXXXXX` — the purchase's UTC date and six characters of an unambiguous alphabet. */
  newContractRef: (at?: Date) => string
  /** A contract reference as a person may type it: trimmed, upper-cased, look-alike dashes unified. */
  normalizeContractRef: (value: string) => string
  normalizeEmail: (value: string | null | undefined) => string
  /**
   * Whether an address is on a reserved top-level domain (`.test`, `.example`, `.invalid`,
   * `.localhost` — RFC 2606 / 6761), any subdomain included: `a@shop.test`, `a@mail.shop.test`,
   * `a@localhost`. Case, surrounding spaces, a display-name form (`Name <a@shop.test>`) and a
   * trailing root dot are all read through.
   */
  isReservedAddress: (address: string) => boolean
  escapeHtml: (value: string) => string
  /** Minor units as a localized amount with its currency (`12,56 €`, `$12.56`). */
  formatMoney: (amountMinor: number, currency: string, lng: string) => string
  /** A date and time in UTC, localized (`23 September 2026, 14:05`). */
  formatDateTime: (at: Date, lng: string) => string
  /** A calendar date in UTC, localized. */
  formatDate: (at: Date, lng: string) => string
  /**
   * The last included day of a window whose deadline is EXCLUSIVE (the first instant it is over),
   * as a UTC date — the copy says "until the end of <date>": 13 October 00:00 UTC is "12 October".
   */
  formatDeadline: (deadline: Date, lng: string) => string
  /** A country's name in a language, else its code. */
  countryName: (country: string, lng: string) => string
}
