import type { LegalDocumentDates, LegalDocumentKey } from './types.js'

/**
 * The shared dates for the platform's legal acceptance and the public site's legal pages.
 * Changing terms/privacy/billing/product updated dates requires renewed terms acceptance;
 * privacy.updated also revises marketing consent. The other documents are display-only.
 */
export const OWLMEANS_LEGAL_DATES = {
  terms: { effective: '2026-05-30', updated: '2026-05-30' },
  privacy: { effective: '2026-05-30', updated: '2026-05-30' },
  cookies: { effective: '2026-09-24', updated: '2026-09-25' },
  'services-agreement': { effective: '2026-10-04', updated: '2026-10-04' },
  'platform-license': { effective: '2026-10-04', updated: '2026-10-04' },
  // These documents date the platform's sign-in terms line without public-site pages yet.
  billing: { effective: '2026-05-30', updated: '2026-05-30' },
  product: { effective: '2026-05-30', updated: '2026-05-30' },
} as const satisfies Record<LegalDocumentKey, LegalDocumentDates>
