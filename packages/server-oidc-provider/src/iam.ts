import type { ClientMetadata, ResponseType } from 'oidc-provider'

/** A registered OIDC client stored in the provider's Client adapter. */
export interface OidcRegisteredClient {
  clientId: string
  secret: string
  /** The entity (realm) this client belongs to — used for identity scoping. */
  entityId?: string
  /** Application display name */
  name?: string
  redirectUris?: string[]
  grantTypes?: string[]
  responseTypes?: string[]
  scope?: string
}

/** Full oidc-provider ClientMetadata with our entity extension. */
export type OidcClientMetadata = ClientMetadata & { entityId?: string; owlEntityId?: string }

/** Convert an OidcRegisteredClient to the oidc-provider ClientMetadata shape. */
export const toClientMetadata = (client: OidcRegisteredClient): OidcClientMetadata => ({
  client_id: client.clientId,
  client_secret: client.secret,
  redirect_uris: client.redirectUris ?? [],
  grant_types: client.grantTypes ?? ['authorization_code', 'refresh_token'],
  response_types: (client.responseTypes ?? ['code']) as ResponseType[],
  token_endpoint_auth_method: 'client_secret_basic',
  scope: client.scope ?? 'openid profile offline_access',
  owlEntityId: client.entityId,
})

/** Extension seam for IAM integration into the OIDC provider — Phase 2 fills this */
export interface OidcProviderIamExtension {
  /** Convert a stored client record to oidc-provider ClientMetadata */
  toClientMetadata: typeof toClientMetadata
  /** Type of a stored client record */
  OidcRegisteredClient: OidcRegisteredClient
  /** Extended metadata type */
  OidcClientMetadata: OidcClientMetadata
}
