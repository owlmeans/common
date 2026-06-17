/** IAM-mode extension for OIDC shared config — lets IAM_MODE flow through standard config.
 *  Uses a string union to avoid a circular dep with @owlmeans/iam (which depends on @owlmeans/oidc). */
export interface OidcIamConfig {
  iamMode?: 'keycloak' | 'integrated'
}
