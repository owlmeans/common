export const DEFAULT_ALIAS = 'iam-service'

export const IAM_MODE_KEYCLOAK = 'keycloak'
export const IAM_MODE_INTEGRATED = 'integrated'

export type IamMode = typeof IAM_MODE_KEYCLOAK | typeof IAM_MODE_INTEGRATED

/**
 * Gate-param syntax: `<permission>[@<selector>]`.
 *
 * The `@` belongs to the GATE and to nothing else. It says where a resource id is read from at
 * request time; it is never part of a permission's stored NAME. A definition or a grant whose name
 * carries one is a key nothing ever looks up, so every grant against it is a silent no-op.
 */
export const RESOURCE_PARAM_SEPARATOR = '@'

/**
 * Separates an explicit source from its path: `@body:order.id`.
 *
 * Deliberately `:` rather than a dot. Under a dotted-only form the meaning of a selector changes the
 * moment a route gains a param named like a source keyword — `/report/:query` with `@query.id` flips
 * from "the route param literally named `query.id`" to "the query string's `id`", redirecting an
 * authorization lookup from a router-matched value to attacker-supplied input, caused by an
 * unrelated route rename. `:` is decidable in one character, and no gate-param string written before
 * this existed can contain one.
 */
export const RESOURCE_SOURCE_SEPARATOR = ':'

/** Separates path segments inside a qualified selector: `@body:order.id`. */
export const RESOURCE_PATH_SEPARATOR = '.'

/** Where a qualified selector may read a resource id from. */
export enum GateParamSource {
  Params = 'params',
  Query = 'query',
  Body = 'body',
  Headers = 'headers',
  Auth = 'auth'
}

/**
 * What the bare form (`@enquiryId`) searches, in order.
 *
 * Params first, then query. The query fallback is legacy and deliberately kept: removing it would
 * silently deny already-deployed applications whose selector happens to name a query key, and a
 * silent denial inside a customer's running app is the worst available outcome.
 */
export const DEFAULT_GATE_PARAM_SOURCES: GateParamSource[] = [
  GateParamSource.Params, GateParamSource.Query
]

/** Why a gate param is structurally wrong — a misconfiguration, not a failed authorization. */
export enum GateParamErrorCode {
  UnknownSource = 'gate-param:unknown-source',
  EmptySelector = 'gate-param:empty-selector',
  EmptySegment = 'gate-param:empty-segment',
  /** Named a request key the entrypoint's filter does not declare — AJV strips it before the gate. */
  UnreachableKey = 'gate-param:unreachable-key',
  /** Named a route param the entrypoint's own path does not carry. */
  UnknownRouteParam = 'gate-param:unknown-route-param'
}

/** Why a selector produced no resource id. */
export enum GateResolutionFailure {
  /** The source exists, the path does not. */
  NotProvided = 'not-provided',
  /** The request carries no such source at all. */
  SourceMissing = 'source-missing',
  /** Resolved to an object or a multi-element array — refused rather than stringified. */
  NotScalar = 'not-scalar',
  /** The selector itself did not parse. */
  Malformed = 'malformed'
}

/**
 * Which FORM of a grant an operation addresses.
 *
 * A resource-scoped permission is grantable two ways, under one name: `Blanket` (a PermissionSet
 * carrying no `resources`, which `hasPermission` reads as covering every id) and `Resources` (an
 * explicit id list). They are stored separately and must be revoked separately, or a UI offering
 * both controls would have one silently wipe the other.
 */
export enum IamGrantMode {
  Blanket = 'blanket',
  Resources = 'resources',
  /** Revoke-only: every form. Illegal on a grant. */
  All = 'all'
}

/** What to do about grants that still reference a definition being removed. */
export enum IamRemovalPolicy {
  /** Strip the permission from every subject of the entity, then drop the definition. */
  Cascade = 'cascade',
  /** Refuse while any subject still holds it; the holders travel in the error. */
  Refuse = 'refuse'
}

/**
 * The grouping tiers a permission definition may be tagged with.
 *
 * A tag decides NOTHING at request time — `hasPermission` and every gate treat a permission name as
 * one opaque string — and only groups the permission in an administrator's screen. `guest` is
 * deliberately absent: a public surface declares no permissions, and adding an area later would
 * re-classify names already tagged.
 */
export const IAM_AREAS = ['user', 'operator', 'admin'] as const

export type IamArea = typeof IAM_AREAS[number]

/** Separates the resource from the action in a permission name. TWO hyphens, never one. */
export const PERMISSION_ACTION_SEPARATOR = '--'
