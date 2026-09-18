import type { ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { InitializedService, LazyService } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { AuthCredentials, AuthPayload, AuthRole, Profile } from '@owlmeans/auth'
import type { ProviderProfileDetails } from '@owlmeans/oidc'

/**
 * Local account record — one per user.
 *
 * `id` is the Mongo resource id; `credential` is the account's stable unique key. `entityId`
 * (inherited from Profile below) holds the organization entity's record id — never its slug.
 */
export interface IdentityAccount extends Omit<Profile, 'entitySlug'>, ResourceRecord {
  id: string
  credential: string
  /** Stable organization-entity id. Renaming the organization does not touch this. */
  entityId?: string
}

/**
 * Local profile record — ties a user to an entity with a role.
 * Mirrors IAMProfile from @owlmeans/auth backend.
 */
export interface IdentityProfile extends Omit<Profile, 'entitySlug'>, ResourceRecord {
  id: string
  profileId: string
  userId?: string
  role: AuthRole
  expiresAt?: Date
  /** Stable organization-entity id — the value every per-organization query filters on. */
  entityId?: string
}

/**
 * Provider credentials record — one per provider link per profile.
 * Maps an external provider subject to a local profile using auth-native fields.
 * credential stores the login-service key: "service:{type}:{service}"
 * userId stores the derived external login key: "{type}:{service}:{providerSub}"
 */
export interface IdentityCredentials extends AuthCredentials, ResourceRecord {
  profileId: string
}

/**
 * An organization entity — the record every per-organization store keys on.
 *
 * Its `id` is the stable entity id. The slug is the value users, URLs and tokens see, and it may
 * move; nothing here except `slug` itself changes when it does, which is the entire point of the
 * record existing.
 */
export interface OrgEntity extends ResourceRecord {
  id?: string
  slug: string
  formerSlugs?: string[]
  iamKey: string
  /**
   * Names this organization is known by in systems that cannot rename: a Kubernetes namespace, a
   * storage prefix, an IAM realm. Minted once through `mintName` and read back forever after.
   */
  names?: Record<string, string>
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
 */
export interface IdentityLinkingService extends InitializedService {
  getLinkedProfile: (details: ProviderProfileDetails) => Promise<AuthPayload | null>
  linkProfile: (details: ProviderProfileDetails, meta: AccountMeta) => Promise<AuthPayload>
  linkCredentials: (details: ProviderProfileDetails) => Promise<AuthPayload>
  /**
   * Forget which profile an external login maps to, so the next `linkProfile` establishes it anew.
   *
   * The stored mapping is keyed `{type, userId, credential}` under a unique index, so a caller
   * that has decided the existing mapping is wrong cannot simply write over it — it has to be
   * retired first. That decision belongs to whoever owns the login path (a decorator serving a
   * different population than the platform's own customers, say); the key format belongs here.
   *
   * Idempotent: a login that maps to nothing is already in the state this promises.
   */
  unlinkCredentials: (details: ProviderProfileDetails) => Promise<void>
  getOwnerProfiles: (entityId: string) => Promise<Profile[]>
  getOwnerCredentials: (userId: string, entityId?: string, type?: string) => Promise<AuthCredentials | undefined>
}

export interface AccountMeta {
  username: string
  force?: boolean
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
 * An organization entity was just registered, together with the account and profile of the person
 * whose first sign-in created it. `entityId` is the stable id every per-organization record keys
 * on; `entitySlug` is its name at this moment and may be renamed later.
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
  createdAt: Date
}

export interface EntityCreatedCallback {
  (event: EntityCreatedEvent, ctx: IdentityContext): Promise<void>
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
}
