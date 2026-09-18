import { OAuthError, OAuthInvalidClient } from '@owlmeans/oauth'
import type { ClientRegistrationRequest, ClientRegistrationResponse } from '@owlmeans/oauth'
import { registerDcrClient } from '../clients.js'
import type { OAuthServerContext } from '../types.js'

export interface RegisterOutcome {
  status: number
  body: ClientRegistrationResponse | { error: string, error_description?: string }
}

/**
 * `POST /oauth/register` — RFC 7591, public clients only. Offered as a fallback for a host that
 * does not (yet) support Client ID Metadata Documents; every MCP-spec client tries CIMD first.
 */
export const handleRegister = async (context: OAuthServerContext, body: unknown): Promise<RegisterOutcome> => {
  if (context.cfg.oauth?.allowDynamicRegistration === false) {
    return { status: 403, body: { error: 'access_denied', error_description: 'Dynamic Client Registration is not offered here' } }
  }
  if (body == null || typeof body !== 'object' || !Array.isArray((body as ClientRegistrationRequest).redirect_uris)) {
    return { status: 400, body: { error: 'invalid_client_metadata', error_description: 'redirect_uris is required' } }
  }

  try {
    const record = await registerDcrClient(context, body as ClientRegistrationRequest)

    return {
      status: 201,
      body: {
        client_id: record.clientId,
        client_id_issued_at: Math.floor(record.createdAt.getTime() / 1000),
        client_name: record.clientName,
        // Absent, never null: a client that validates the response (the MCP SDK does) rejects a
        // null for a field it treats as an optional string.
        ...(typeof record.clientUri === 'string' && record.clientUri !== '' ? { client_uri: record.clientUri } : {}),
        ...(typeof record.logoUri === 'string' && record.logoUri !== '' ? { logo_uri: record.logoUri } : {}),
        redirect_uris: record.redirectUris,
        grant_types: record.grantTypes,
        response_types: record.responseTypes,
        token_endpoint_auth_method: 'none',
      },
    }
  } catch (e) {
    const message = e instanceof OAuthInvalidClient || e instanceof OAuthError ? e.message : 'invalid_client_metadata'

    return { status: 400, body: { error: 'invalid_client_metadata', error_description: message } }
  }
}
