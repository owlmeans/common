import type { ResponseType } from 'oidc-provider'
import type { OidcClientMetadata, OidcRegisteredClient, ToClientMetadata } from './types.js'

/** Convert an OidcRegisteredClient to the oidc-provider ClientMetadata shape. */
export const toClientMetadata: ToClientMetadata = (client: OidcRegisteredClient): OidcClientMetadata => ({
  client_id: client.clientId,
  client_secret: client.secret,
  redirect_uris: client.redirectUris ?? [],
  grant_types: client.grantTypes ?? ['authorization_code', 'refresh_token'],
  response_types: (client.responseTypes ?? ['code']) as ResponseType[],
  token_endpoint_auth_method: 'client_secret_basic',
  scope: client.scope ?? 'openid profile offline_access',
  owlEntityId: client.entityId,
})

