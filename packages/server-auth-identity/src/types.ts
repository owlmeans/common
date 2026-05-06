import type { ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { InitializedService } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { AuthCredentials, AuthPayload, AuthRole, Profile } from '@owlmeans/auth'
import type { ProviderProfileDetails } from '@owlmeans/oidc'

/**
 * Local account record — one per user.
 * id is the Mongo resource id; credential is the stable unique local entity slug.
 */
export interface IdentityAccount extends Profile, ResourceRecord {
  id: string
  credential: string
}

/**
 * Local profile record — ties a user to an entity with a role.
 * Mirrors IAMProfile from @owlmeans/auth backend.
 */
export interface IdentityProfile extends Profile, ResourceRecord {
  id: string
  profileId: string
  userId?: string
  role: AuthRole
  expiresAt?: Date
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

