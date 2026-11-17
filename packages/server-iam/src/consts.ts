export const SERVER_IAM_SERVICE = 'server-iam-service'

/**
 * The runtime IAM API's owner-only leaf paths, under the same base as `@owlmeans/iam`'s
 * `IAM_RUNTIME_ROUTES`. The provider declares them beside that frozen tree; a static segment, so
 * `/organizations/all` never reads as the organization slugged `all`.
 */
export const IAM_RUNTIME_ADMIN_ROUTES = {
  /** Every organization of the calling app — its owner's alone. */
  organizationsAll: '/organizations/all',
} as const

/**
 * `AuthForbidden` reason: a runtime admin route needs the app owner's marker permission. The same
 * reason the IAM gate refuses a permission with, so a provider's marshalled refusal and a bare 403
 * read alike.
 */
export const ADMIN_REFUSAL = 'permission'
