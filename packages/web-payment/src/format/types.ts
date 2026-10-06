/** How the package's components render money and UTC dates in a locale. */
export interface FormatHelper {
  /** Minor units as a currency amount in a locale; an unknown locale or currency still reads. */
  money: (minor: number, currency: string, locale: string) => string
  /** A calendar day in UTC (`dateStyle: 'long'`); `''` for no or an unparseable date. */
  dayUtc: (date: Date | string | null | undefined, locale: string) => string
  /**
   * The last day of a window whose deadline is EXCLUSIVE (the start of the next UTC day) — the day a
   * consumer reads as "until". The rule is `@owlmeans/payment`'s `lastWithdrawalDayOf`, the one the
   * server's e-mails and texts use, so the dialog and the mail never name different days.
   */
  lastDayUtc: (deadline: Date | string | null | undefined, locale: string) => string
  /** A date and time in UTC, to the second — the moment a declaration was received. */
  momentUtc: (date: Date | string | null | undefined, locale: string) => string
  /** A date and time in UTC to the minute, with the zone named — when a limit rises again. */
  shortMomentUtc: (date: Date | string | null | undefined, locale: string) => string
}
