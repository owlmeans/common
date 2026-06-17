export const DEFAULT_ALIAS = 'iam-service'

export const IAM_MODE_KEYCLOAK = 'keycloak'
export const IAM_MODE_INTEGRATED = 'integrated'

export type IamMode = typeof IAM_MODE_KEYCLOAK | typeof IAM_MODE_INTEGRATED
