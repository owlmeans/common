import type { ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { InitializedService, LazyService } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { AuthCredentials, AuthPayload, AuthRole, PermissionSet, Profile } from '@owlmeans/auth'
import type { ProviderProfileDetails } from '@owlmeans/oidc'

/**
 * The person — one account per e-mail address, whichever method or app they sign in through.
 *
 * `id` is the Mongo resource id; `credential` is the account's stable unique key. Every sign-in
 * method is a {@link IdentityCredentials} row pointing here, never a second account.
 */
export interface IdentityAccount extends Omit<Profile, 'entitySlug'>, ResourceRecord {
  id: string
  credential: string
  /** Trimmed, lower-case, unique — the identity a second method or a second app lands on. */
  email: string
  /**
   * The account's main (personal) organization, created with it — a declared reference to the
   * org-entity registry. Renaming the organization does not touch this.
   */
  entityId: string
  /** Never a wildcard: what a person may do lives on their profile rows, per app. */
  scopes: string[]
}

/**
 * One person in one organization for one app — the row authorization reads.
 *
 * A row exists per (account, app, organization). The PRIMARY row of an (account, app) is the one in
 * the account's main organization; it carries what belongs to the person as a user of the app
 * rather than to a membership (`home`, `disabled`), and it exists whenever any other row of that
 * (account, app) does.
 */
export interface IdentityProfile extends Omit<Profile, 'entitySlug' | 'credential' | 'permissions'>, ResourceRecord {
  id: string
  /** `profileIdOf(service, userId)` — the same on every row of one (account, app), never minted. */
  profileId: string
  /** The account — a declared reference. */
  userId: string
  /** The app: the deployment's own app key, or a target's login client id. */
  service: string
  /** The organization — a declared reference to the org-entity registry. */
  entityId: string
  /** Owner of that organization. */
  owner?: boolean
  role: AuthRole
  /** `['*']` only on the rows of a deployment's own app; `[]` on a target's rows. */
  scopes: string[]
  /** Grants, scoped to the app's client id. */
  permissions: PermissionSet[]
  /** Group keys of (this organization, this app) — the groups live in the organization record. */
  groups?: string[]
  /** Primary row only: the organization the person acts in by default — a declared reference. */
  home?: string
  /** Primary row only: the person may not use the app at all. */
  disabled?: boolean
  /** Written by staff synchronization, which removes only the rows it wrote. */
  managed?: boolean
  expiresAt?: Date
  createdAt?: Date
}

/**
 * One sign-in method of an account — a provider link.
 *
 * `userId` is the derived external login key `"{type}:{service}:{providerSub}"` and `credential`
 * the login-service key `"service:{type}:{service}"`; together with `type` they are the unique
 * identity of the method. `accountId` names the account it signs into.
 */
export interface IdentityCredentials extends AuthCredentials, ResourceRecord {
  /** The account — a declared reference. */
  accountId: string
  /** Reserved for a profile-level credential; nothing writes it. */
  profileId?: string
}

/**
 * Narrows which permission definitions a group bundle covers — the same fields the IAM's
 * permission filter carries, declared here so the store stays free of the IAM contract.
 */
export interface OrgGroupFilter {
  areas?: (string | null)[]
  managed?: boolean
  resourceScoped?: boolean
  entityScoped?: boolean
}

export interface OrgGroupBundle {
  filter?: OrgGroupFilter
  permissions?: string[]
}

/**
 * A group of one organization for one app. Members are the profile rows naming `key` in their
 * `groups`; the grants are the group's own `permissions`.
 */
export interface OrgGroup {
  /** The app (client id) the group belongs to. One app never writes another's group. */
  service: string
  /** Unique per (`service`, `key`) inside the organization. */
  key: string
  title?: string
  managed?: boolean
  permissions: PermissionSet[]
  bundles?: OrgGroupBundle[]
}

/**
 * An organization entity — the record every per-organization store keys on.
 *
 * Its `id` is the stable entity id. The slug is the value users, URLs and tokens see, and it may
 * move; nothing here except `slug` itself changes when it does, which is the entire point of the
 * record existing.
 *
 * Every writer changes it field by field (`$set` / `$push` / `$pull`), never by replacing the
 * document: a whole-record write from a stale read erases what another writer added since — a
 * group, a minted name.
 */
export interface OrgEntity extends ResourceRecord {
  id?: string
  slug: string
  formerSlugs?: string[]
  iamKey: string
  /** Display name. */
  title?: string
  /**
   * Names this organization is known by in systems that cannot rename: a Kubernetes namespace, a
   * storage prefix, an IAM realm. Minted once through `mintName` and read back forever after.
   */
  names?: Record<string, string>
  groups?: OrgGroup[]
  createdAt: Date
  updatedAt?: Date
}

export type OrgEntityResource = MongoResource<OrgEntity>

export type IdentityAccountResource = MongoResource<IdentityAccount>
export type IdentityProfileResource = MongoResource<IdentityProfile>
export type IdentityCredentialsResource = MongoResource<IdentityCredentials>

/**
 * Compatible with AccountLinkingService from @owlmeans/server-oidc-rp
 * but defined independently to avoid circular dependency.
 *
 * Every payload it answers names the row of THIS deployment's own app (`appendAuthIdentityResources`'
 * `service`) in the account's main organization.
 */
export interface IdentityLinkingService extends InitializedService {
  getLinkedProfile: (details: ProviderProfileDetails) => Promise<AuthPayload | null>
  linkProfile: (details: ProviderProfileDetails, meta: AccountMeta) => Promise<AuthPayload>
  /** Attach the method `details` describes to the account of the row `details.profileId` names. */
  linkCredentials: (details: ProviderProfileDetails) => Promise<AuthPayload>
  /**
   * Forget which account an external login maps to, so the next `linkProfile` establishes it anew.
   *
   * The stored mapping is keyed `{type, userId, credential}` under a unique index, so a caller
   * that has decided the existing mapping is wrong cannot simply write over it — it has to be
   * retired first.
   *
   * Idempotent: a login that maps to nothing is already in the state this promises.
   */
  unlinkCredentials: (details: ProviderProfileDetails) => Promise<void>
  /** Every row of this deployment's own app in the organization. */
  getOwnerProfiles: (entityId: string) => Promise<Profile[]>
  /** A credential of the account `userId`, as the own app's row in `entityId` (default: the main organization). */
  getOwnerCredentials: (userId: string, entityId?: string, type?: string) => Promise<AuthCredentials | undefined>
}

export interface AccountMeta {
  /** The verified e-mail address the login established — the account it lands on. */
  username: string
}

export interface IdentityResourcesOptions {
  /**
   * This deployment's own app key — the `service` of the rows its own sign-in writes
   * (`DEFAULT_APP_SERVICE` when omitted).
   */
  service?: string
}

export interface EnsureAccountArgs {
  email: string
  /** Display name; the address when omitted. */
  name?: string
}

export interface EnsuredAccount {
  account: IdentityAccount
  /**
   * The personal organization THIS call created with the account — absent when the person was
   * already known. Whoever completes the registration (the owner row) announces it with it.
   */
  registered?: OrgEntity
}

export interface EnsureProfileArgs {
  account: IdentityAccount
  /** The app the row belongs to. */
  service: string
  /** The organization; the account's main organization makes it the primary row. */
  entityId: string
  owner?: boolean
  role?: AuthRole
  scopes?: string[]
  permissions?: PermissionSet[]
  groups?: string[]
  managed?: boolean
}

export interface IdentityConfig extends ServerConfig {
}

export interface IdentityContext<C extends IdentityConfig = IdentityConfig> extends ServerContext<C> {
}

export interface GoogleUserInfo {
  sub: string
  email: string
  email_verified?: boolean
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
}

/**
 * An organization entity was just registered, together with the account and owner row of the
 * person whose first sign-in created it. `entityId` is the stable id every per-organization record
 * keys on; `entitySlug` is its name at this moment and may be renamed later.
 */
export interface EntityCreatedEvent {
  entityId: string
  entitySlug: string
  iamKey: string
  accountId: string
  profileId: string
  username: string
  /** The login's `AuthenticationType`. */
  type: string
  /** The provider service alias the login came through. */
  service: string
  /** The app the owner row belongs to. */
  profileService: string
  createdAt: Date
}

export interface EntityCreatedCallback {
  (event: EntityCreatedEvent, ctx: IdentityContext): Promise<void>
}

/**
 * A person became a user of an app: the PRIMARY row of an (account, app) was just created. Fired
 * once per (account, app) — a further organization's row of the same pair announces nothing.
 */
export interface ProfileCreatedEvent {
  /** The organization of the primary row — the account's main organization. */
  entityId: string
  entitySlug: string
  accountId: string
  profileId: string
  /** The app. */
  service: string
  owner: boolean
}

export interface ProfileCreatedCallback {
  (event: ProfileCreatedEvent, ctx: IdentityContext): Promise<void>
}

/**
 * Lifecycle notifications from the identity store — the seam an application hangs provisioning on
 * (a starting plan, a default workspace) without wrapping the linking service.
 *
 * Lazy, so a listener can be registered while the context is still being wired.
 */
export interface IdentityEventsService extends LazyService {
  /** Called for every entity registered from now on, in registration order. */
  onEntityCreated: (callback: EntityCreatedCallback) => void
  /**
   * Run every listener, one after another, each awaited. A listener that throws is logged and the
   * rest still run: a listener's failure never fails the sign-in that created the entity.
   */
  propagateEntityCreated: (event: EntityCreatedEvent) => Promise<void>
  /** Called for every (account, app) that gets its first row from now on, in registration order. */
  onProfileCreated: (callback: ProfileCreatedCallback) => void
  /** Same delivery rules as {@link propagateEntityCreated}. */
  propagateProfileCreated: (event: ProfileCreatedEvent) => Promise<void>
}
