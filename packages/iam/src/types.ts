import type { InitializedService } from '@owlmeans/context'
import type { OidcOrganizationClaim, OidcPermissionSetClaim, OidcProviderConfig } from '@owlmeans/oidc'
import type {
  GateParamSource, GateParamErrorCode, GateResolutionFailure, IamDefaultClass, IamGrantMode, IamGrantOrigin,
  IamRemovalPolicy
} from './consts.js'

/**
 * The parts of a request a gate selector may read.
 *
 * Structural on purpose: `AbstractRequest` is assignable to it, so `@owlmeans/server-iam` passes its
 * request straight through, while tooling outside the server stack can resolve a selector against a
 * plain object without taking a dependency on `@owlmeans/entrypoint`.
 */
export interface GateRequestLike {
  params?: unknown
  query?: unknown
  body?: unknown
  headers?: unknown
  auth?: unknown
}

/** Where one gate param reads its resource id from. */
export interface GateResourceSelector {
  /** The selector text exactly as written, for diagnostics. */
  readonly selector: string
  /** Undefined for the bare form, which searches `sources` in order. */
  readonly source?: GateParamSource
  /** Length 1 and UNSPLIT for the bare form — a bare key may legally contain dots. */
  readonly path: string[]
  /** The explicit source, or `DEFAULT_GATE_PARAM_SOURCES`. */
  readonly sources: GateParamSource[]
}

export interface GateParamProblem {
  code: GateParamErrorCode
  detail: string
}

export interface ParsedGateParam {
  permission: string
  /**
   * @deprecated The bare-form flat key, kept so existing readers keep compiling. Read `resource`,
   * which carries the source and the path for both forms.
   */
  resourceParam?: string
  resource?: GateResourceSelector
  error?: GateParamProblem
}

export interface GateResourceResolution {
  id?: string
  from?: GateParamSource
  reason?: GateResolutionFailure
}

/** What an entrypoint declares, so a selector can be checked against it before it is ever deployed. */
export interface GateParamAudit {
  routePath?: string
  routeParams?: string[]
  filter?: {
    query?: object
    params?: object
    body?: object
    headers?: object
  }
}

export interface GateParamIssue {
  param: string
  code: GateParamErrorCode
  detail: string
}

/** A permission NAME taken apart. Never carries a selector — `@` is the gate's syntax alone. */
export interface ParsedPermissionName {
  /** The whole name, exactly as it must be stored and granted. */
  name: string
  /** What IAM stores as `resource`. The whole name when there is no action separator. */
  resource: string
  /** What IAM stores as `action`. Absent for a bare, unsplittable legacy name. */
  action?: string
  /** Set when the argument carried an `@` — which a NAME never legally does. */
  problem?: GateParamProblem
}

/**
 * A client's own configuration, stored with its registration.
 *
 * The two tenancy flags decide which organizations the client's subjects act in. With NEITHER, every
 * subject acts in the client's owning organization (a single-tenant app). With either, every subject
 * acts in organizations of its own, and the runtime IAM API lets their owners manage them — `users`
 * opens the `user` area to those owners, `operators` the `operator` area. Anything else is the
 * client's arbitrary configuration, carried through untouched.
 */
export interface IamClientConfig {
  operators?: boolean
  users?: boolean
  [key: string]: unknown
}

export interface IamClient {
  id?: string
  clientId: string
  secret?: string
  name?: string
  /** The entity realm this client belongs to — replaces the old (client as any)._realm hack */
  realm?: string
  config?: IamClientConfig
}

/** A client as a reader that must never see its secret gets it. */
export type IamClientInfo = Omit<IamClient, 'secret'>

export interface IamCredentialsPair {
  token: string
  realm: string
}

export interface IamClientOptions {
  /**
   * Explicit allowed redirect URIs for the client. Pass the concrete callbacks a deployment
   * may return to — the generated host, an attached custom domain, and owner-registered
   * self-host origins.
   *
   * Omitting them is a **legacy keycloak-only** shape: Keycloak accepts a `*` wildcard, while
   * the integrated provider does exact `redirect_uri` matching and rejects a wildcard outright
   * (`oidc-provider` refuses a client whose `redirect_uris` are not absolute URIs). Backends
   * that cannot honour a wildcard MUST throw `IamClientError` instead of registering an
   * unusable client.
   */
  redirectUris?: string[]
  /**
   * Merged SHALLOWLY into the stored configuration: a key passed is written (a flag passed as
   * `false` included), a key omitted is kept. A backend with no tenancy refuses a tenancy flag.
   */
  config?: IamClientConfig
}

export interface IamPermissionArgs {
  /** Action name. When absent the permission is unscoped (project-wide). */
  permission?: string
  /**
   * Declares that grants of this permission may be bound to specific resource ids.
   *
   * It does NOT mean grants must be: the same name is grantable in either form. A grant carrying no
   * resource ids covers every resource, which is what `hasPermission` already implements.
   */
  resourceScoped?: boolean
  /**
   * Declares that grants of this permission are bound to ONE organization: stored on the row of that
   * organization (or a group of it) and effective only while the subject acts in it.
   *
   * Turning it off while grants exist is refused — every bound grant would silently widen to
   * every organization of its subject.
   */
  entityScoped?: boolean
  /** Optional human-readable title for the permission definition. */
  title?: string
  /**
   * Grouping tag — one of `IAM_AREAS`, or any string a deployment defines.
   *
   * Purely presentational: it groups the permission in an administrator's screen and is never read
   * when a request is authorized. It is a TAG rather than a name segment precisely so an existing
   * permission can be grouped without renaming it, which would orphan every grant already made.
   */
  area?: string
  /**
   * Marks a permission the PLATFORM owns rather than one the application declared for itself.
   *
   * The distinction is not cosmetic: an operator must not be able to revoke a platform marker from
   * an undifferentiated list, and a repair that deletes "definitions no declaration names" must not
   * reach one — a marker can be enforced by a runtime decoration rather than by a gate parameter,
   * so its absence from the declarations is not evidence that it is unused.
   */
  managed?: boolean
  /**
   * Who holds it without an explicit grant. `User` needs an unbound, unmanaged `user`-area
   * definition; `Member` / `Owner` need an `entityScoped` one. `None` (or omitted on creation) is
   * nobody.
   */
  defaultClass?: IamDefaultClass
}

export interface IamResourceSpec {
  name: string
  displayName?: string
}

/** A permission declared for an entity's client (project). */
export interface IamPermissionDefinition {
  /** Canonical name: "res--action" or bare "res" when unscoped. NEVER carries an `@` selector. */
  name: string
  resource: string
  action?: string
  resourceScoped?: boolean
  /** Grants are bound to one organization. See `IamPermissionArgs.entityScoped`. */
  entityScoped?: boolean
  title?: string
  /** Grouping tag; presentational only. See `IamPermissionArgs.area`. */
  area?: string
  /** Owned by the platform rather than declared by the application. See `IamPermissionArgs.managed`. */
  managed?: boolean
  /** Who holds it by default. See `IamPermissionArgs.defaultClass`. */
  defaultClass?: IamDefaultClass
}

/** Narrows a definition listing. An `areas` entry of `null` matches definitions carrying no tag. */
export interface IamPermissionFilter {
  areas?: (string | null)[]
  managed?: boolean
  resourceScoped?: boolean
  entityScoped?: boolean
}

/** A group, named the way it is on the wire: its organization's slug and its key in that organization. */
export interface IamGroupRef {
  entitySlug: string
  key: string
}

export interface IamGrantArgs {
  /** Resource ids for the resource-scoped grant form; omit for an unscoped (project-wide) grant. */
  resources?: string[]
  /**
   * Which form to address. THE DEFAULTS ARE ASYMMETRIC ON PURPOSE, to preserve the semantics every
   * existing caller already relies on:
   *
   *   grantPermission  — `resources != null` ? Resources : Blanket
   *   revokePermission — `resources != null` ? Resources : All
   *
   * Revoke defaults to `All` because a bare `revokePermission(...)` has always meant "remove it
   * everywhere". Narrowing that to `Blanket` would leave the resource-scoped set standing for every
   * existing caller — a live grant surviving a revoke, which is the failure direction nobody detects.
   *
   * Pass `mode` explicitly rather than depending on the default.
   */
  mode?: IamGrantMode
  /**
   * The organization a grant of an `entityScoped` definition is bound to — REQUIRED for one (it
   * names the subject's row there, which must exist) and refused for any other definition.
   */
  entitySlug?: string
}

/**
 * A permission held by ONE subject — a person (`profileId`) or a group (`group`), never both — of an
 * entity's client.
 */
export interface IamGrant {
  /** Backend-specific subject id: integrated = the pairwise `profileId`, keycloak = KC user id. */
  profileId?: string
  /** A group subject. */
  group?: IamGroupRef
  clientId: string
  /** Canonical permission name. */
  permission: string
  /** Present only for resource-scoped grants. */
  resources?: string[]
  /** Which form this record is. Derived from `resources`, not new information. */
  mode?: IamGrantMode
  /** The organization the grant is bound to; absent for an unbound one. */
  entitySlug?: string
  /** Why the subject holds it. Listings report it; a write answers `Direct`. */
  origin?: IamGrantOrigin
  /** The group a `Group`-origin grant reaches the person through. */
  through?: IamGroupRef
}

/** Grants every definition a filter selects, plus any named outright. */
export interface IamGrantBundle {
  filter?: IamPermissionFilter
  /** Extra names included regardless of the filter — a platform marker, for instance. */
  permissions?: string[]
  /** Defaults to `Blanket`: a tier of access is a role, not a resource ACL. */
  mode?: IamGrantMode
  /** Only meaningful with `mode: Resources`. */
  resources?: string[]
  /** The binding of the bundle's `entityScoped` definitions. See `IamGrantArgs.entitySlug`. */
  entitySlug?: string
}

export interface IamPermissionDeleteArgs {
  /** Defaults to `Cascade`. */
  policy?: IamRemovalPolicy
  /** Required to delete a `managed` definition. Defaults to false. */
  managed?: boolean
}

export interface IamPermissionRemoval {
  permission: string
  clientId: string
  /** The definition existed and was removed. False is a normal, non-error outcome. */
  found: boolean
  /** Grants stripped as part of the removal. */
  revoked: IamGrant[]
}

export interface IamNormalizeArgs {
  /** Compute and report the plan without writing anything. */
  dryRun?: boolean
}

export interface IamNormalizationReport {
  clientId: string
  renamed: { from: string, to: string, grantsMoved: number }[]
  merged: { from: string, into: string, grantsMoved: number }[]
  /** Well-formed definitions deliberately left alone. */
  untouched: string[]
}

/** One organization a user of a client belongs to there. */
export interface IamMembershipInfo {
  entitySlug: string
  title?: string
  owner: boolean
  groups: string[]
  /** The organization the user starts in. */
  home?: boolean
}

/** A subject of one client (app): one account, seen through that app's rows. */
export interface IamUser {
  /** Backend-specific subject id: integrated = the pairwise `profileId`, keycloak = KC user id. */
  profileId: string
  /** Primary login identifier (email for the integrated OTP path). */
  email?: string
  name?: string
  /** AuthRole value. */
  role: string
  disabled?: boolean
  /** Convenience count of permission grants the user holds (across clients, or for one client). */
  grantCount?: number
  /** The `entitySlug` of the organization the user starts in. */
  home?: string
  memberships?: IamMembershipInfo[]
}

/** Args to invite/create an end-user of a client. */
export interface IamUserInvite {
  email: string
  name?: string
  /** AuthRole value; defaults to the backend's standard end-user role. */
  role?: string
}

/** Args to update an existing end-user. `disabled` is written on the user's primary row. */
export interface IamUserUpdate {
  name?: string
  role?: string
  disabled?: boolean
}

/** An organization as a client's administration sees it. Named by slug only. */
export interface IamOrganization {
  entitySlug: string
  title?: string
  /** How many subjects of the client are members. */
  members?: number
}

/** `organizations.create`: the organization's title, and the subject who becomes its owner. */
export interface IamOrganizationArgs {
  title?: string
  /** A subject of the client — the creator, on the runtime path. */
  profileId?: string
}

export interface IamOrganizationUpdate {
  title: string
}

/** A member of an organization, as one client sees it. */
export interface IamMember {
  profileId: string
  email?: string
  name?: string
  owner: boolean
  /** Group keys of (this organization, this client). */
  groups: string[]
  /** Written by the staff synchronization; an operator cannot change it. */
  managed?: boolean
}

/** Find-or-create by e-mail: an invitation and a first sign-in converge on one account. */
export interface IamMemberInvite {
  email: string
  name?: string
  owner?: boolean
}

export interface IamMemberUpdate {
  owner?: boolean
  groups?: string[]
}

/** What a group grants its members: every definition the filter selects, plus names outright. */
export interface IamGroupBundle {
  filter?: IamPermissionFilter
  permissions?: string[]
}

/** A group of (organization, client) — kept inside the organization record. */
export interface IamGroup {
  entitySlug: string
  key: string
  title?: string
  /** Kept by the platform (the staff sync's `members`); an operator cannot write it. */
  managed?: boolean
  members?: number
  bundles: IamGroupBundle[]
}

export interface IamGroupArgs {
  title?: string
  bundles?: IamGroupBundle[]
}

/** `syncStaff`: what the managed `members` group of the owning organization grants. */
export interface IamStaffSyncArgs {
  bundles: IamGroupBundle[]
}

/** The subjects whose managed rows the sync created and removed. */
export interface IamStaffSyncReport {
  added: string[]
  removed: string[]
}

/** Who a subject is to a client, as the provider builds its claims. */
export interface IamSubject {
  /** The pairwise subject: `subjects.identify(clientId, accountId)`. */
  profileId: string
  email?: string
  name?: string
  organizations: OidcOrganizationClaim[]
  /** The FULL claim sets: a set bound to an organization carries its `entitySlug`. */
  permissions: OidcPermissionSetClaim[]
}

export interface IamSignInArgs {
  email: string
  name?: string
}

export interface IamSignInResult {
  accountId: string
  profileId: string
}

/**
 * The organizations a client's subjects act in. Every method takes `(entityId, clientId, …)`: the
 * entity that OWNS the client, then the client — the organizations themselves are named by slug.
 */
export interface IamOrganizationFacet {
  /** Every organization with a member of the client. */
  list: (entityId: string, clientId: string) => Promise<IamOrganization[]>
  get: (entityId: string, clientId: string, entitySlug: string) => Promise<IamOrganization | null>
  create: (entityId: string, clientId: string, args?: IamOrganizationArgs) => Promise<IamOrganization>
  update: (entityId: string, clientId: string, entitySlug: string, update: IamOrganizationUpdate) => Promise<IamOrganization>
  members: (entityId: string, clientId: string, entitySlug: string) => Promise<IamMember[]>
  /** Idempotent by e-mail. Refused past the membership cap. */
  addMember: (entityId: string, clientId: string, entitySlug: string, invite: IamMemberInvite) => Promise<IamMember>
  /** Refused when it would leave the organization without an owner. */
  updateMember: (
    entityId: string, clientId: string, entitySlug: string, profileId: string, update: IamMemberUpdate
  ) => Promise<IamMember>
  /** Refused for the last owner. */
  removeMember: (entityId: string, clientId: string, entitySlug: string, profileId: string) => Promise<void>
}

/**
 * Groups of (organization, client). Every method takes `(entityId, clientId, entitySlug, …)` and the
 * group key after it where one is addressed; one client never reads or writes another client's group.
 */
export interface IamGroupFacet {
  list: (entityId: string, clientId: string, entitySlug: string) => Promise<IamGroup[]>
  ensure: (entityId: string, clientId: string, entitySlug: string, key: string, args?: IamGroupArgs) => Promise<IamGroup>
  /** Also drops the key from every member row. */
  remove: (entityId: string, clientId: string, entitySlug: string, key: string) => Promise<void>
  members: (entityId: string, clientId: string, entitySlug: string, key: string) => Promise<IamMember[]>
  addMembers: (entityId: string, clientId: string, entitySlug: string, key: string, profileIds: string[]) => Promise<void>
  removeMembers: (entityId: string, clientId: string, entitySlug: string, key: string, profileIds: string[]) => Promise<void>
  /** The binding of a group grant is the group's organization; `args.entitySlug` is not taken. */
  grant: (
    entityId: string, clientId: string, entitySlug: string, key: string, permission: string,
    args?: Omit<IamGrantArgs, 'entitySlug'>
  ) => Promise<IamGrant>
  revoke: (
    entityId: string, clientId: string, entitySlug: string, key: string, permission: string,
    args?: Omit<IamGrantArgs, 'entitySlug'>
  ) => Promise<void>
  grants: (entityId: string, clientId: string, entitySlug: string, key: string) => Promise<IamGrant[]>
  setBundles: (
    entityId: string, clientId: string, entitySlug: string, key: string, bundles: IamGroupBundle[]
  ) => Promise<IamGroup>
}

/**
 * The provider's half: who signs in to a client and what the claims say about them. Keyed by the
 * ACCOUNT, which never leaves the provider; what a client sees is the pairwise subject.
 */
export interface IamSubjectFacet {
  /** `null` = not admitted: no row of the client, or a disabled primary row. */
  resolve: (clientId: string, accountId: string) => Promise<IamSubject | null>
  /** Find-or-create the account by e-mail and its rows for the client. Race-safe. */
  signIn: (clientId: string, args: IamSignInArgs) => Promise<IamSignInResult>
  /** The pairwise `sub` of the account for the client — computed, the same on every call. */
  identify: (clientId: string, accountId: string) => string
}

/** Unified IAM provider interface — all platform/agent code calls only this, never a backend directly */
export interface IamService extends InitializedService {
  // --- Admin config (backend → OIDC RP config, payment provisioning) ---
  getEntityAdminConfig: (entityId: string) => Promise<OidcProviderConfig>
  getCredentialsPair: (entityId: string) => Promise<IamCredentialsPair>

  /**
   * The public, fully-qualified OIDC **issuer** URL a relying party of this entity must use for
   * discovery — the single value a consumer needs (`OidcProviderDescriptor.discoveryUrl`). Each
   * backend owns its own URL shape: keycloak `https://{iam-host}/realms/{entityId}`, integrated
   * `https://{provider-host}/{basePath}`. Nothing outside an adapter may reassemble it.
   *
   * The returned string MUST equal, byte for byte, what the provider advertises as `issuer` in
   * its discovery document: `openid-client` compares the two and fails the whole discovery when
   * they differ. Implementations resolve it from configuration only — no remote admin call — and
   * throw `IamClientError` when the provider's service route is not configured, so a
   * misconfiguration is loud instead of yielding a silently wrong issuer.
   */
  getIssuerUrl: (entityId: string) => Promise<string>

  // --- Provisioning (agent → story development) ---

  /**
   * Find-or-create the entity's OIDC client.
   *
   * A client id is globally unique — a provider resolves it from the bare `client_id` a relying
   * party sends, with no tenant context — so an implementation MUST refuse an existing record
   * that belongs to a different entity (`IamClientError('client:entity-mismatch')`) rather than
   * returning it. Silently adopting one hands the caller another tenant's secret and overwrites
   * that tenant's redirect URIs.
   */
  ensureClient: (entityId: string, clientId: string, options?: IamClientOptions) => Promise<IamClient>

  /** The entity's client without its secret, or null when there is none. Never provisions. */
  getClient: (entityId: string, clientId: string) => Promise<IamClientInfo | null>

  /**
   * Reserve a client id for the entity without provisioning it, so a caller can find a free name
   * before committing to it. Returns false when the id is already taken — by this entity or any
   * other — and true when the reservation is now held.
   *
   * This exists because the id is minted from a name that may later be released (a project alias
   * moves when its hostname is refused), so the naming index cannot answer whether an id is free.
   * The registry is the only authority.
   */
  claimClient: (entityId: string, clientId: string) => Promise<boolean>

  /**
   * Release a client id and everything keyed by it — its subjects' rows, its groups and its
   * definitions. Called when a project or slot is deleted; without it a recreated project can
   * inherit a stale registration.
   */
  deleteClient: (entityId: string, clientId: string) => Promise<void>

  /**
   * Ensures a permission/resource exists in the entity's client.
   * Returns the canonical resource name (e.g. "res--action" or "res").
   *
   * MERGES into an existing definition rather than replacing it: `resource` and `action` are
   * re-derived and overwrite, while `title`, `resourceScoped`, `entityScoped`, `area`, `managed` and
   * `defaultClass` are set when provided — including when provided as `false` / `None` — and KEPT
   * when omitted. Replacing wholesale made every flag last-write-wins, so a caller that happened not
   * to pass one erased it.
   *
   * It NEVER rewrites the name. Callers round-trip a definition's `resource` + `action` back through
   * this method to copy a definition set between clients, so a rename here would silently orphan
   * every grant made against the old name.
   *
   * The `resource` argument must not carry a gate selector: `@` is the gate's syntax and is never
   * part of a stored name. Implementations reject one rather than storing a key no gate looks up.
   * A `defaultClass` the definition's flags do not admit is refused (`IamPermissionError`).
   */
  ensurePermission: (
    entityId: string,
    clientId: string,
    resource?: string,
    args?: IamPermissionArgs
  ) => Promise<string>

  /**
   * Removes permission definitions, and by default every grant that referenced them.
   *
   * Takes NAMES: the definition record is keyed by name, and a malformed definition's stored
   * `resource`/`action` cannot be trusted to recompose that key. Accepts an array so a repair costs
   * one sweep of the entity's subjects rather than one per name.
   *
   * Idempotent — a name with no definition yields `{ found: false }` and writes nothing. Every other
   * lifecycle operation here converges rather than erroring, and two repairs may run concurrently on
   * one project.
   *
   * Implementations MUST revoke the grants before dropping the definition. There is no transaction
   * across the two stores, and a crash between them must leave a definition with no grants — visible
   * and re-runnable — rather than grants with no definition, which are invisible to any screen that
   * renders the definition list yet still satisfy a gate.
   *
   * A `managed` definition is refused unless `args.managed` is explicitly true.
   */
  deletePermission: (
    entityId: string,
    clientId: string,
    permission: string | string[],
    args?: IamPermissionDeleteArgs
  ) => Promise<IamPermissionRemoval[]>

  /**
   * Repairs definitions whose stored name carries a gate selector, moving grants with them.
   *
   * Strictly a rename and merge — never a delete, never an invention. Where the stripped name
   * already exists the two are merged, because one entrypoint scoping a permission by `:id` and
   * another by `:enquiryId` describe ONE permission. The target is marked resource-scoped: a leaked
   * selector is positive evidence that it is, and that evidence is otherwise discarded.
   *
   * Grants move in the same write that renames the definition, which is why this exists as its own
   * operation: reconstructing it as delete + re-declare + re-grant drops real access on any failure
   * between the three steps.
   */
  normalizePermissions: (
    entityId: string,
    clientId: string,
    args?: IamNormalizeArgs
  ) => Promise<IamNormalizationReport>

  /**
   * Idempotent: creates a resource, a client role for it, and assigns that role to
   * the entity-owner role. Used by payment provisioning for account/project/wl resources.
   */
  ensureResourceOwnership: (
    entityId: string,
    clientId: string,
    resource: IamResourceSpec
  ) => Promise<void>

  // --- Authorization (permission definitions & grants) ---

  /** Lists permission definitions registered for the entity's client, optionally narrowed. */
  listPermissions: (
    entityId: string,
    clientId: string,
    filter?: IamPermissionFilter
  ) => Promise<IamPermissionDefinition[]>

  /**
   * Grants a permission to an end-user subject. With args.resources the grant is
   * resource-scoped (bound to those resource ids); without it the grant is project-wide.
   * An `entityScoped` definition is granted on the subject's row of `args.entitySlug`.
   */
  grantPermission: (
    entityId: string,
    clientId: string,
    profileId: string,
    permission: string,
    args?: IamGrantArgs
  ) => Promise<IamGrant>

  /**
   * Revokes a grant. With args.resources only those resource ids are removed;
   * without it the whole grant is removed.
   */
  revokePermission: (
    entityId: string,
    clientId: string,
    profileId: string,
    permission: string,
    args?: IamGrantArgs
  ) => Promise<void>

  /**
   * Grants every permission a bundle selects to each subject, idempotently.
   *
   * Exists as its own operation rather than a loop over `grantPermission` because a backend that
   * loads-mutates-saves a subject per call turns N permissions across M subjects into N·M writes and
   * N·M lost-update windows on the same records. Collapsing to one read and one write per subject is
   * also what makes re-running it genuinely idempotent.
   *
   * Returns what each subject now holds, not what changed.
   */
  grantBundle: (
    entityId: string,
    clientId: string,
    profileIds: string[],
    bundle: IamGrantBundle
  ) => Promise<IamGrant[]>

  /**
   * Lists grants for the entity's client, optionally for a single subject — what each holds
   * directly, by its definition's default class and through its groups, `origin` telling which.
   */
  listGrants: (entityId: string, clientId: string, profileId?: string) => Promise<IamGrant[]>

  // --- End-user management (per client: rows of one app) ---

  /**
   * Lists the subjects of the client — every account holding a row of that app, in whichever
   * organization. Without `clientId` it is a read-only aggregate over every client the entity
   * owns, for a console; nothing is written through it.
   */
  listUsers: (entityId: string, clientId?: string) => Promise<IamUser[]>

  /** Loads a single subject of the client by its id, or null when absent. */
  getUser: (entityId: string, clientId: string, profileId: string) => Promise<IamUser | null>

  /** Creates (or resolves, idempotently by email) a subject of the client. */
  inviteUser: (entityId: string, clientId: string, invite: IamUserInvite) => Promise<IamUser>

  /** Updates a subject's mutable fields; `disabled` is written on its primary row. */
  updateUser: (entityId: string, clientId: string, profileId: string, update: IamUserUpdate) => Promise<IamUser>

  /** Deletes this account's rows of the client only — the account and its other apps stay. */
  removeUser: (entityId: string, clientId: string, profileId: string) => Promise<void>

  /**
   * Admits the owning organization's own staff to the client: keeps the managed `IAM_MEMBERS_GROUP`
   * group there with `bundles`, a managed row per staff account, and removes the managed rows of
   * people no longer on the staff.
   */
  syncStaff: (entityId: string, clientId: string, args: IamStaffSyncArgs) => Promise<IamStaffSyncReport>

  // --- Tenancy facets — a backend without them answers `unsupportedFacet(...)` ---

  organizations: IamOrganizationFacet
  groups: IamGroupFacet
  subjects: IamSubjectFacet
}
