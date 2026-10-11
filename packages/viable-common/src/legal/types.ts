/** ISO YYYY-MM-DD dates, formatted for the reader's locale by the consumer. */
export interface LegalDocumentDates {
  /** The day this version of the document takes effect. */
  effective: string
  /** The day this version of the document was last edited. */
  updated: string
}

/** A publication source awaiting activation; preparation dates are not effective dates. */
export interface PendingLegalDocumentDates {
  status: 'pending'
  effective: null
  updated: null
}

export type LegalDocumentDateMetadata = LegalDocumentDates | PendingLegalDocumentDates

/** The complete document set; the date table must cover every key. */
// Kept as a type: a union of the document keys.
export type LegalDocumentKey = 'terms' | 'privacy' | 'cookies' | 'services-agreement' | 'platform-license'
  | 'data-processing-agreement' | 'subprocessors' | 'company-information'
  | 'acceptable-use' | 'refund-cancellation' | 'service-level-agreement' | 'billing' | 'product'
