import type { ClientRegistrationRequest, OAuthClientRecord } from '@owlmeans/oauth'
import type { OAuthDcrClientRecord } from '../types.js'

/** Every source one context's authorization server resolves a `client_id` from. */
export interface OAuthClientsHelper {
  /** A client declared in configuration, or `null`. */
  staticClientOf: (clientId: string) => OAuthClientRecord | null
  /** A DCR-registered client, or `null` — bumping its `lastUsedAt` on every use. */
  dcrClientOf: (clientId: string) => Promise<OAuthClientRecord | null>
  /**
   * RFC 7591, public clients only (`token_endpoint_auth_method: 'none'` — a confidential client
   * has nowhere safe to keep a secret at this layer, since the whole family exists for clients that
   * cannot). A request naming any other auth method, or a symmetric-secret grant, is refused rather
   * than silently narrowed — the caller asked for something this server cannot give it honestly.
   */
  registerDcrClient: (request: ClientRegistrationRequest) => Promise<OAuthDcrClientRecord>
  /** One entry point, trying every source in turn: configuration, a metadata document, DCR. */
  resolveClient: (clientId: string) => Promise<OAuthClientRecord | null>
}
