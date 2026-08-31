import type { InitializedService } from '@owlmeans/context'
import type { OidcProviderConfig } from '@owlmeans/oidc'
import type {
  GateParamSource, GateParamErrorCode, GateResolutionFailure, IamGrantMode, IamRemovalPolicy
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

export interface IamClient {
  id?: string
  clientId: string
  secret?: string
  name?: string
  /** The entity realm this client belongs to — replaces the old (client as any)._realm hack */
  realm?: string
}

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
  title?: string
  /** Grouping tag; presentational only. See `IamPermissionArgs.area`. */
  area?: string
  /** Owned by the platform rather than declared by the application. See `IamPermissionArgs.managed`. */
  managed?: boolean
}

/** Narrows a definition listing. An `areas` entry of `null` matches definitions carrying no tag. */
export interface IamPermissionFilter {
  areas?: (string | null)[]
  managed?: boolean
  resourceScoped?: boolean
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
}

/** A permission granted to an end-user subject of an entity's client. */
export interface IamGrant {
  /** Backend-specific subject id: integrated = IdentityProfile.profileId, keycloak = KC user id. */
  profileId: string
  clientId: string
  /** Canonical permission name. */
  permission: string
  /** Present only for resource-scoped grants. */
  resources?: string[]
  /** Which form this record is. Derived from `resources`, not new information. */
  mode?: IamGrantMode
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

/** An end-user of an entity (customer-wide; shared across that entity's projects). */
export interface IamUser {
  /** Backend-specific subject id: integrated = IdentityProfile.profileId, keycloak = KC user id. */
  profileId: string
  /** Primary login identifier (email for the integrated OTP path). */
  email?: string
  name?: string
  /** AuthRole value. */
  role: string
  disabled?: boolean
  /** Convenience count of permission grants the user holds (across clients, or for one client). */
  grantCount?: number
}

/** Args to invite/create an end-user under an entity. */
export interface IamUserInvite {
  email: string
  name?: string
  /** AuthRole value; defaults to the backend's standard end-user role. */
  role?: string
}

/** Args to update an existing end-user. */
export interface IamUserUpdate {
  name?: string
  role?: string
  disabled?: boolean
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
   * Release a client id and everything keyed by it. Called when a project or slot is deleted —
   * without it a recreated project can inherit a stale registration.
   */
  deleteClient: (entityId: string, clientId: string) => Promise<void>

  /**
   * Ensures a permission/resource exists in the entity's client.
   * Returns the canonical resource name (e.g. "res--action" or "res").
   *
   * MERGES into an existing definition rather than replacing it: `resource` and `action` are
   * re-derived and overwrite, while `title`, `resourceScoped`, `area` and `managed` are set when
   * provided — including when provided as `false` — and KEPT when omitted. Replacing wholesale made
   * every flag last-write-wins, so a caller that happened not to pass one erased it.
   *
   * It NEVER rewrites the name. Callers round-trip a definition's `resource` + `action` back through
   * this method to copy a definition set between clients, so a rename here would silently orphan
   * every grant made against the old name.
   *
   * The `resource` argument must not carry a gate selector: `@` is the gate's syntax and is never
   * part of a stored name. Implementations reject one rather than storing a key no gate looks up.
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

  /** Lists grants for the entity's client, optionally for a single subject. */
  listGrants: (entityId: string, clientId: string, profileId?: string) => Promise<IamGrant[]>

  // --- End-user management (customer-wide users, shared per entityId) ---

  /**
   * Lists the entity's end-users. End-users are customer-wide — shared across every project of
   * the entity — so `clientId` scopes the reported `grantCount` to one project's client and does
   * **not** filter the set: a user who has authenticated against a project but holds no grant
   * there is still that project's user, and the screen that manages grants is exactly where they
   * must be visible.
   */
  listUsers: (entityId: string, clientId?: string) => Promise<IamUser[]>

  /** Loads a single end-user by subject id, or null when absent. */
  getUser: (entityId: string, profileId: string) => Promise<IamUser | null>

  /** Creates (or resolves, idempotently by email) an end-user under the entity. */
  inviteUser: (entityId: string, invite: IamUserInvite) => Promise<IamUser>

  /** Updates an end-user's mutable fields (name, role, disabled). */
  updateUser: (entityId: string, profileId: string, update: IamUserUpdate) => Promise<IamUser>

  /** Removes an end-user from the entity (their grants go with them). */
  removeUser: (entityId: string, profileId: string) => Promise<void>
}
