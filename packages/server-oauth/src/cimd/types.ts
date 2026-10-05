import type { OAuthClientRecord } from '@owlmeans/oauth'

/** Client ID Metadata Documents: a `client_id` that is itself an HTTPS URL, fetched and cached. */
export interface CimdHelper {
  /**
   * Resolve a `client_id` that is itself an HTTPS URL, per the Client ID Metadata Document draft.
   *
   * Fetched, never assumed: the AS reaches out to a URL a party it has no relationship with
   * supplied, so every step here is a mitigation the spec's own security section asks for — no
   * redirects followed, a private/loopback/link-local address refused before the request is even
   * made, a byte ceiling enforced while reading rather than after, and a short deadline so a slow or
   * silent server cannot hold the authorization request open. A failed or invalid fetch is never
   * cached, so a transient problem does not become an outage remembered for the cache lifetime.
   */
  fetchClientIdMetadataDocument: (clientId: string) => Promise<OAuthClientRecord | null>
  /** Test-only escape hatch: never used by production code, which always calls the real fetch. */
  forgetCachedClientIdMetadataDocument: (clientId: string) => void
}
