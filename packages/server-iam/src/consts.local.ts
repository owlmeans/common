import { ORGANIZATION_OWNER_REFUSAL, ORGANIZATION_REFUSAL } from '@owlmeans/oidc'
import { ADMIN_REFUSAL } from './consts.js'
import type { Access } from './types.local.js'

/** `@owlmeans/server-api`'s incident header; a production error body is nothing but this id. */
export const INCIDENT_ID_HEADER = 'x-incident-id'

/** The `AuthForbidden` reason a bare 403 means, by the access level of the route that answered it. */
export const FORBIDDEN_REASONS: Record<Access, string> = {
  subject: ORGANIZATION_REFUSAL,
  member: ORGANIZATION_REFUSAL,
  owner: ORGANIZATION_OWNER_REFUSAL,
  admin: ADMIN_REFUSAL,
}
