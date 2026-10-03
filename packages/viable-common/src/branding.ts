import type { SlotMetadata } from './types.js'

/**
 * The build-time environment keys a generated application reads its branding from.
 *
 * Named here, once, because two processes emit them — the publisher for the preview and the agent
 * for a production publish — and a key spelled differently in one of them produces an application
 * that silently falls back to its defaults with nothing anywhere reporting it.
 */
export const BRANDING_ENV_KEYS = [
  'BRANDING_COPYRIGHT',
  'BRANDING_ORGANIZATION',
  'BRANDING_TERMS_URL',
  'BRANDING_PRIVACY_URL',
  'BRANDING_CREDIT',
  'BRANDING_PRODUCT',
  'BRANDING_GOOGLE_TAG',
] as const

/**
 * Slot metadata as build-time environment.
 *
 * `BRANDING_CREDIT` is the one value whose ABSENCE means something: only an explicit empty string
 * hides the platform credit, so a metadata set that never carried the key keeps it. That is the
 * safe direction — the opposite failure hands out a paid feature and nobody reports getting more
 * than they paid for.
 *
 * `BRANDING_PRODUCT` is always EMITTED empty: the product's name is the target's own `APP_TITLE`,
 * stated from the project card, and the slot metadata carries no human-readable name to deliver.
 *
 * `BRANDING_GOOGLE_TAG` is always EMITTED, empty when no tag is set, although its metadata key is
 * omitted from a push while unset: the environment is read by the application's own build, which
 * treats `''` as "load no tag", while the metadata key is read by a publisher that may predate it.
 */
export const brandingEnv = (meta: Partial<SlotMetadata>): Record<string, string> => ({
  BRANDING_COPYRIGHT: meta.brandingCopyright ?? '',
  BRANDING_ORGANIZATION: meta.brandingOrganization ?? '',
  BRANDING_TERMS_URL: meta.brandingTermsUrl ?? '',
  BRANDING_PRIVACY_URL: meta.brandingPrivacyUrl ?? '',
  BRANDING_CREDIT: meta.brandingCredit === '' ? '' : '1',
  // Never `projectName`. That is the project's ALIAS — a lowercase slug the OIDC client id, the
  // key namespace and the address are composed from — and a build that took it for the product's
  // name put `slopepact` in the tab, the manifest and the legal pages beside a header saying
  // `SlopePact`. The human-readable name is the project card's title, which the platform states in
  // the target's own `APP_TITLE`; every page reads that, and the build falls back to it whenever
  // this is empty. The key stays, always emitted, so a bundle never carries a bare `process.env`
  // read — and so an explicit override still has somewhere to arrive.
  BRANDING_PRODUCT: '',
  BRANDING_GOOGLE_TAG: meta.brandingGoogleTag ?? '',
})
