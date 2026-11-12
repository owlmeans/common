/** A resource whose Mongo collection is reached directly — a conditional write's target. */
export interface CollectionHolder { collection: unknown }

/** The package's pure primitives: paygate payload readers, store guards and audit text. */
export interface PaymentUtils {
  isDuplicateKey: (error: unknown) => boolean
  /** A paygate object reference, expanded or not, as its id. */
  idOf: (value: string | { id?: string } | null | undefined) => string | undefined
  /** Epoch seconds → `Date`. */
  dateOf: (seconds: number | null | undefined) => Date | undefined
  /** Drop `null` and `undefined` properties — a stored record reads an absent field back as `null`. */
  compact: <T extends object>(value: T) => T
  /** A conditional single-document `$set` — `true` when the filter matched (the guard held). */
  conditionalSet: (
    resource: CollectionHolder, filter: Record<string, unknown>, set: Record<string, unknown>,
  ) => Promise<boolean>
  /** A conditional single-document delete — `true` when the filter matched (the guard held). */
  conditionalDelete: (resource: CollectionHolder, filter: Record<string, unknown>) => Promise<boolean>
  /**
   * A raw collection filter addressing ONE record by its id (`_id`), plus `filter` — what a
   * conditional raw write (`$inc` guarded by a value) of a record known by id matches on.
   */
  idCriteria: (id: string, filter?: Record<string, unknown>) => Record<string, unknown>
  /** An error's message for an audit record, never a stack. */
  errorText: (error: unknown) => string
}
