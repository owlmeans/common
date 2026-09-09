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
] as const

/**
 * Slot metadata as build-time environment.
 *
 * `BRANDING_CREDIT` is the one value whose ABSENCE means something: only an explicit empty string
 * hides the platform credit, so a metadata set that never carried the key keeps it. That is the
 * safe direction — the opposite failure hands out a paid feature and nobody reports getting more
 * than they paid for.
 */
export const brandingEnv = (meta: Partial<SlotMetadata>): Record<string, string> => ({
  BRANDING_COPYRIGHT: meta.brandingCopyright ?? '',
  BRANDING_ORGANIZATION: meta.brandingOrganization ?? '',
  BRANDING_TERMS_URL: meta.brandingTermsUrl ?? '',
  BRANDING_PRIVACY_URL: meta.brandingPrivacyUrl ?? '',
  BRANDING_CREDIT: meta.brandingCredit === '' ? '' : '1',
  BRANDING_PRODUCT: meta.projectName ?? '',
})
