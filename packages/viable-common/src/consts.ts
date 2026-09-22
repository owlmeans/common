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
] satisfies (keyof SlotSecretMetadata)[]
