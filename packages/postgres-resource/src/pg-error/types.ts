/** Reading and translating the errors the `pg` driver raises. */
export interface PgErrorHelper {
  /**
   * The framework's error marshalling preserves only type, message and stack, so the
   * Postgres diagnostics have to travel inside the message. Downstream tooling — notably
   * the viable-agent fixer, which retries on `42P01` / `42703` — classifies on exactly
   * this text, so the code always leads.
   *
   * `where` is deliberately never included: it can echo bound parameter values.
   *
   * Exported so a wrapper can quote the diagnostics without also quoting the translated error's
   * own type prefix, which would nest one error vocabulary inside another's message.
   */
  describePgError: (error: unknown) => string
  /**
   * Translate a raw `pg` driver error into the framework's error vocabulary, so a driver
   * type never escapes the package. Errors that already are `ResilientError`s pass through
   * untouched — the reconciler and the migration runner raise their own.
   * A migration may supply its resolved SQL; placeholders stay intact and parameter values
   * are never added. The statement travels in the message so error marshalling preserves it.
   */
  pgErrorToResourceError: (error: unknown, query?: string) => Error
}
