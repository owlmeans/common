import type { LegalDocumentDateMetadata, LegalDocumentKey } from './types.js'

/**
 * The shared dates for the platform's legal acceptance and the public site's legal pages.
 * Consumers select the actual agreement keys for acceptance. Optional purposes carry their own
 * wording revisions, independent of this table. Pending documents have no effective/update date;
 * a coordinated publication and acceptance release supplies those dates when activated.
 */
export const OWLMEANS_LEGAL_DATES = {
  terms: { effective: '2026-05-30', updated: '2026-05-30' },
  privacy: { effective: '2026-05-30', updated: '2026-05-30' },
  cookies: { effective: '2026-09-24', updated: '2026-09-25' },
  'services-agreement': { effective: '2026-10-04', updated: '2026-10-04' },
  'platform-license': { effective: '2026-10-04', updated: '2026-10-04' },
  'data-processing-agreement': { status: 'pending', effective: null, updated: null },
  subprocessors: { status: 'pending', effective: null, updated: null },
  'company-information': { status: 'pending', effective: null, updated: null },
  'acceptable-use': { status: 'pending', effective: null, updated: null },
  'refund-cancellation': { status: 'pending', effective: null, updated: null },
  'service-level-agreement': { status: 'pending', effective: null, updated: null },
  // Historical acceptance aliases retained for existing records; new Platform configuration uses
  // `platform-license` for billing and Terms for product-use rules.
  billing: { effective: '2026-05-30', updated: '2026-05-30' },
  product: { effective: '2026-05-30', updated: '2026-05-30' },
} as const satisfies Record<LegalDocumentKey, LegalDocumentDateMetadata>
