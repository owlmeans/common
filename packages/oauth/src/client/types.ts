import type {
  AuthorizationServerMetadata, DeviceAuthorizationRequest, DeviceAuthorizationResponse, DeviceSignInOutcome,
  OAuthTokenSuccess, PollDeviceTokenOptions, ProtectedResourceMetadata
} from '../types.js'

/** The client side of this family's OAuth surface: discovery, the device grant, the code grant, revocation. */
export interface OAuthClientHelper {
  /**
   * RFC 9728 discovery, from a resource's own origin — what an MCP client does before it knows
   * which authorization server to talk to. `resourcePath` is appended to the well-known prefix
   * exactly as the server side composes it (empty for the root resource).
   */
  discoverProtectedResource: (resourceOrigin: string, resourcePath?: string) => Promise<ProtectedResourceMetadata>
  /**
   * RFC 8414 discovery, for an issuer with no path component — the shape this family's own
   * authorization server always has (co-located with the API origin). A caller that already knows
   * the issuer (the platform's own MCP config) skips `discoverProtectedResource` and calls this
   * directly.
   */
  discoverAuthorizationServer: (issuer: string) => Promise<AuthorizationServerMetadata>
  requestDeviceAuthorization: (
    server: AuthorizationServerMetadata, body: DeviceAuthorizationRequest
  ) => Promise<DeviceAuthorizationResponse>
  exchangeAuthorizationCode: (
    server: AuthorizationServerMetadata,
    req: { code: string, redirectUri: string, clientId: string, codeVerifier: string, resource?: string }
  ) => Promise<OAuthTokenSuccess>
  /**
   * RFC 8628 §3.5: poll until the user acts, the code expires, or the caller aborts.
   *
   * Never throws for a normal outcome — `denied`/`expired`/`aborted` are answers, not exceptions,
   * because a CLI holder reads this in a loop and a thrown error there would need to be caught
   * right back into the same set of outcomes. Only a wire-level fault (a non-JSON body, a network
   * error other than abort) escapes as `OAuthError`.
   */
  pollDeviceToken: (server: AuthorizationServerMetadata, opts: PollDeviceTokenOptions) => Promise<DeviceSignInOutcome>
  revokeToken: (server: AuthorizationServerMetadata, req: { token: string, clientId: string }) => Promise<void>
}
