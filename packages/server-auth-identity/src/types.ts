import type { ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { InitializedService } from '@owlmeans/context'
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

