import type { InitializedService } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { OidcProviderConfig, OidcSharedConfig, WithSharedConfig, ProviderProfileDetails, OidcUserDetails, OidcProviderSettings } from '@owlmeans/oidc'
import type { AuthCredentials, AuthPayload, Profile } from '@owlmeans/auth'
import type { Configuration, ServerMetadata, TokenEndpointResponse, TokenEndpointResponseHelpers } from 'openid-client'

// ---------------------------------------------------------------------------
// OwlMeans-owned public types — no upstream openid-client type appears below
// the line marked with (@public). Only src/service.ts may import openid-client
// types directly; all other files use these interfaces.
// ---------------------------------------------------------------------------

/** Opaque descriptor for an OIDC client configuration obtained via discovery.
 *  Consumers receive and pass it back; they must never read its internals. */
export type OidcClientDescriptor = Configuration

/** Token set returned from any grant. Includes the standard OAuth2 fields
 *  plus the openid-client helper method `claims()` for ID-token claim access. */
export interface OidcTokenSet {
  access_token?: string
  refresh_token?: string
  id_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
  /** Decode and return claims from the ID token. */
  claims: () => Record<string, unknown>
}

/** Subset of OidcTokenSet without helper methods; used for storage/serialization. */
export type OidcTokenSetParameters = Pick<OidcTokenSet, 'access_token' | 'refresh_token' | 'id_token' | 'token_type' | 'expires_in' | 'scope'>

/** PKCE + ID-token check parameters for the authorization-code grant. */
export interface OidcGrantChecks {
  pkceCodeVerifier?: string
  idTokenExpected?: boolean
}

/** Issuer/endpoint metadata from the OIDC discovery document. */
export type OidcServerMetadata = ServerMetadata

/** Response from token introspection. */
export interface OidcIntrospectionResponse {
  active: boolean
  scope?: string
  sub?: string
  client_id?: string
  token_type?: string
  exp?: number
  iat?: number
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Internal adapter types — used only within this package (@internal)
// These preserve the upstream types for internal implementation use only.
// ---------------------------------------------------------------------------

/** @internal — internal alias; do not export from index.ts */
export type TokenSet = TokenEndpointResponse & TokenEndpointResponseHelpers
/** @internal */
export type TokenSetParameters = TokenEndpointResponse

// ---------------------------------------------------------------------------
// Service interfaces (@public)
// ---------------------------------------------------------------------------

export interface OidcClientService extends InitializedService {
  getConfiguration: (clientId: string | Partial<OidcProviderConfig>) => Promise<OidcClientDescriptor>
  getClient: (clientId: string | OidcClientDescriptor | Partial<OidcProviderConfig>) => Promise<OidcClientAdapter>
  getConfig: (clientId: string | Partial<OidcProviderConfig>) => Promise<OidcProviderConfig | undefined>
  getDefault: () => string | undefined

  registerTemporaryProvider: (config: OidcProviderConfig) => OidcProviderConfig
  unregisterTemporaryProvider: (params: Partial<OidcProviderConfig>) => void
  hasProvider: (params: string | Partial<OidcProviderConfig>) => boolean
  entityToClientId: (params: Partial<OidcProviderConfig>) => string

  providerApi: () => ProviderApiService | null
  accountLinking: () => AccountLinkingService | null
  findProvider: (predicate: (provider: OidcProviderConfig) => boolean) => OidcProviderConfig | undefined
}

export interface OidcClientAdapter {
  getMetadata: () => OidcServerMetadata
  getClientId: () => string
  getConfig: () => OidcProviderConfig
  makeAuthUrl: (params: Record<string, string>) => string
  grantWithCredentials: () => Promise<OidcTokenSet>
  grantWithCode: (currentUrl: string, checks: OidcGrantChecks, params: Record<string, string>) => Promise<OidcTokenSet>
  refresh: (tokenSet: OidcTokenSetParameters | string) => Promise<OidcTokenSetParameters>
  introspect: (tokenSet: OidcTokenSetParameters, type?: string) => Promise<OidcIntrospectionResponse>
}

export interface OidcRpConfig extends OidcSharedConfig {
  accountLinkingService?: string
  providerApiService?: string
}

export interface Config extends ServerConfig, WithSharedConfig {
  oidc: OidcRpConfig
}

export interface Context<C extends Config = Config> extends ServerContext<C> { }

export interface AccountLinkingService extends InitializedService {
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

export interface ProviderApiService extends InitializedService {
  getUserDetails: (token: string, userId: string) => Promise<OidcUserDetails>
  getSettings: (token: string, realm: string) => Promise<OidcProviderSettings>
}

