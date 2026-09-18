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
