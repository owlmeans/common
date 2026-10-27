import type { NonSecretScalarSlotMetadata, SlotListMetadata, SlotSecretMetadata } from "./types.js"

export enum SeniorityMode {
  Junior = 'junior',
  Middle = 'middle',
  Senior = 'senior'
}

export const metadataConfigs = [
  'projectName',
  'oidcClientId',
  'oidcRealm',
  'oidcIssuerUrl',
  'brandingCopyright',
  'brandingOrganization',
  'brandingTermsUrl',
  'brandingPrivacyUrl',
  'brandingCredit',
  'brandingHideCreditIntent',
  // Optional in `SlotConstMetadata`: omitted from a push while unset (an older publisher refuses
  // an undeclared key), so an empty stored row must never be delivered as `''`.
  'brandingGoogleTag',
] satisfies (keyof NonSecretScalarSlotMetadata)[]

export const metadataLists = [
  'permissions',
  'backendEnvVars',
  'frontendEnvVars',
  'oidcRedirectUris',
  'allowedOrigins'
] satisfies (keyof SlotListMetadata)[]

export const metadataSecrets = [
  'oidcClientSecret',
  'dbAppPassword',
  'valkeyPassword',
  'appSecret',
] satisfies (keyof SlotSecretMetadata)[]

/**
 * The environment key a generated application's api and worker read the workload's `appSecret`
 * from — set by the platform after the owner's variables, in the preview, in production and in a
 * local target's `.env`, so no owner variable can replace it.
 */
export const APP_SECRET_ENV = 'APP_SECRET'

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
