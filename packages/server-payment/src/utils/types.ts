import type Stripe from 'stripe'

/** A resource whose Mongo collection is reached directly — a conditional write's target. */
export interface CollectionHolder { collection: unknown }

/** The package's pure primitives: paygate payload readers, store guards and audit text. */
export interface PaymentUtils {
  /**
   * The API version a client was built with — read back from the client, never written as a literal,
   * so a webhook endpoint always receives the payload shapes the client itself parses.
   */
  apiVersionOf: (stripe: Stripe) => string
  isDuplicateKey: (error: unknown) => boolean
  /** A paygate answer meaning the object does not exist (deleted, or never did). */
  isMissingObject: (error: unknown) => boolean
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
  /** An error's message for an audit record, never a stack. */
  errorText: (error: unknown) => string
}
