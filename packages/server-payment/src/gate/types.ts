import type { Auth } from '@owlmeans/auth'
import type { EntityResolverOption } from '../types.js'

/** The authenticated entity a gate asserts for. */
export interface GateEntity { auth: Auth, entityId: string }

/** One request as a payment gate reads it. */
export interface GateRequestScope {
  /** The entity the request acts for by default: `req.entity.id`, else the token's entity. */
  defaultEntity: () => string | null
  /** Resolve the authenticated entity a gate asserts for, or refuse. @throws AuthForbidden */
  gateEntityOf: (opts?: EntityResolverOption) => GateEntity
}
