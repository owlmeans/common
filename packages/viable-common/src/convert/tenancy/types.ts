import type { ViableTenancyDecision } from '../../areas/types.js'
import type { OriginProof } from '../types.js'

/**
 * How the ORIGIN splits its people into tenants — a team, a workspace, an account — as a
 * conversion reads it out of the whole-file summaries.
 *
 * A Viable target never keeps a tenant of its own: its organizations are the IAM's, its people and
 * their access the IAM's, its acting organization the sign-in's. So a converted origin's tenant is
 * not a domain entity to rebuild but a MAPPING onto that surface: the tenant becomes the
 * organization, its key fields the organization key (`entityId`, never a field, a column or an
 * input), its membership and invitation records the IAM's people, its switcher the header's
 * organization switch, and its settings one organization-scoped record. Recorded in
 * `docs/conversion/tenancy.md` (`CONVERSION_TENANCY_FILE`); every claim rests on a proof checked
 * against the summaries, and an unverifiable one is dropped.
 */
export interface OriginTenancy {
  tenant: OriginTenant
  /** Who belongs to a tenant, and in which role. */
  membership?: OriginTenancyPart
  /** How a person is asked into a tenant. */
  invitation?: OriginTenancyPart
  /** How a person chooses the tenant they act in — a route parameter, a remembered id, a switcher. */
  switcher?: OriginTenancyPart
  /** What a tenant configures for itself — a key, a name, defaults. */
  settings?: OriginTenancyPart
  /** The persisted models the origin keeps per tenant, by their names in its code. */
  scopedEntities: string[]
  /** The evidence every claim above rests on, each checked against the summaries. */
  proofs: OriginProof[]
}

export interface OriginTenant {
  /** The model the origin keeps its tenants in — `Team`. */
  entity: string
  /** The word its people see — `team`. */
  label: string
  /** The fields the origin keys tenant records by — `teamId`. */
  keyFields: string[]
  /** The route prefixes carrying the tenant — `/api/teams/:teamId`, `/t/:teamId`. */
  routePrefixes: string[]
}

/** One tenant-management part of the origin: the model or mechanism, what it carries, one sentence. */
export interface OriginTenancyPart {
  /** The model, field or component it is — `TeamMember`, `Invitation`, `lastTeamId`, `TeamSwitcher`. */
  entity: string
  /** What it carries — the roles of a membership, the fields of the settings. */
  fields: string[]
  note: string
}

/**
 * What `docs/conversion/tenancy.md` holds as DATA, read back.
 *
 * `decision` is the settled flags (`by: 'model'`, the quotes found verbatim in the origin's own
 * texts) — `null` where the model said nothing usable; `tenancy` the map, `null` where the origin
 * keeps no tenants. A document is always written, tenanted or not, so its existence is the step's
 * durable guard.
 */
export interface OriginTenancyRecord {
  decision: ViableTenancyDecision | null
  tenancy: OriginTenancy | null
}

/**
 * What ONE model call answers about the origin's tenancy — the model-facing twin of
 * {@link OriginTenancy} plus the two flags the platform records.
 *
 * Every optional part is a required key that may be `null` (a structured answer writes an unset
 * optional as `null`), nothing is named after a JSON-schema keyword, and a proof's line pair is a
 * list rather than a tuple.
 */
export interface OriginTenancyAnswer {
  /** Whether the origin keeps tenants at all. */
  tenanted: boolean
  tenant: OriginTenantAnswer | null
  membership: OriginTenancyPartAnswer | null
  invitation: OriginTenancyPartAnswer | null
  switcher: OriginTenancyPartAnswer | null
  settings: OriginTenancyPartAnswer | null
  scopedEntities: string[]
  /** The signed-in END USERS work inside tenants. */
  users: boolean
  /** The origin's own sentence or line saying so, copied word for word. */
  usersQuote: string | null
  /** The STAFF of a back office work inside tenants. */
  operators: boolean
  operatorsQuote: string | null
  rationale: string
}

export interface OriginTenantAnswer extends OriginTenant {
  proofs: OriginProof[]
}

export interface OriginTenancyPartAnswer extends OriginTenancyPart {
  proofs: OriginProof[]
}
