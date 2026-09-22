import type { AuthRole } from '@owlmeans/auth'
import type { OAuthClientOrigin, OAuthClientRecord, OAuthRequestKind, OAuthResourceConfig } from '@owlmeans/oauth'
import type { Resource, ResourceRecord } from '@owlmeans/resource'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { ApiServerAppend } from '@owlmeans/server-api'

/** A client declared in configuration — the one every deployment has at least one of (its own
 * MCP server), never fetched from anywhere and never expiring. */
export interface OAuthStaticClient {
  clientId: string
  clientName: string
  clientUri?: string
  logoUri?: string
  redirectUris: string[]
  /** Scopes this client may ever be issued. Absent means the caller's own, same as a hand-minted token. */
  scope?: string
}

/**
 * A value that may need the live context to resolve — a hostname a Kubernetes secret mount
 * populates only once the process has actually started is not yet readable at the moment
 * `appendOAuthServer` is called from `makeContext`, so every URL-shaped option here is resolved
 * FRESH on each call that needs it (`resolveOAuthUrl`) rather than baked in once.
 */
export type OAuthUrlOption<C extends OAuthServerConfig = OAuthServerConfig> =
  string | ((context: ServerContext<C>) => string)

export interface OAuthServerOptions {
  /** This authorization server's issuer. Normally the API's own origin, with no path. */
  issuer: OAuthUrlOption
  /**
   * The consent screen's fully-qualified URL (`@owlmeans/web-oauth`'s `/oauth/consent`, on the
   * WEB origin — a different one from the issuer whenever the deployment splits API and web
   * across subdomains, which this platform's own dev/prod environments both do).
   */
  consentUrl: OAuthUrlOption
  /** The device-verification screen's fully-qualified URL (`/oauth/device`, same origin as `consentUrl`). */
  deviceUrl: OAuthUrlOption
  /**
   * Resources this server issues tokens for — drives RFC 9728 metadata and audience checks.
   *
   * `resource` is lazily resolved exactly like `issuer`/`consentUrl`/`deviceUrl`, for the SAME
   * reason: `@owlmeans/oauth`'s own `OAuthResourceConfig.resource` is a plain string because that
   * package is generic across client and server, so widening IT to a context-resolving function
   * would require it to import `ServerContext` — this server-only option type is the seam that
   * keeps that import out of a package used unmodified in a browser bundle.
   */
  resources: Array<Omit<OAuthResourceConfig, 'resource'> & { resource: OAuthUrlOption }>
  clients?: OAuthStaticClient[]
  /** Resource alias holding pending requests/codes. Defaults to `OAUTH_PENDING_RESOURCE`. */
  pendingResourceAlias?: string
  /** DB alias the DCR client store lives in — pass the same one identity/token resources use. */
  dcrDbAlias?: string
  /** Lifetime of a token minted through this server, in seconds. Defaults to 90 days. */
  tokenTtlSec?: number
  /** Whether Dynamic Client Registration is offered at all. Defaults to true. */
  allowDynamicRegistration?: boolean
  /** Whether Client ID Metadata Documents are resolved. Defaults to true. */
  allowClientIdMetadataDocuments?: boolean
}

export interface OAuthServerConfig extends ServerConfig {
  oauth?: OAuthServerOptions
}

export type OAuthServerContext<C extends OAuthServerConfig = OAuthServerConfig> = ServerContext<C> & ApiServerAppend

// --- Pending records, all sharing one resource -------------------------------------------------

export type OAuthRequestStatus = 'pending' | 'approved' | 'denied'

/** The subject a consent approval resolved — carried on a device request (to mint immediately)
 * or on an authorization code (to mint when it is exchanged, since that happens unauthenticated). */
export interface OAuthApprovedSubject {
  entityId: string
  userId: string
  profileId: string
  role: AuthRole
  scopes: string[]
}

/** id = `req:<random>`. The one record both grants build the consent screen from. */
export interface OAuthPendingRequestRecord extends ResourceRecord {
  kind: OAuthRequestKind
  clientId: string
  clientOrigin: OAuthClientOrigin
  scope?: string
  resource?: string
  deviceName?: string
  // Code grant only:
  redirectUri?: string
  state?: string
  codeChallenge?: string
  // Device grant only — kept so the consent view can render the code, and so a poll that arrives
  // between approval and delivery can answer once minting has happened.
  userCode?: string
  status: OAuthRequestStatus
  /** Set once, at approval, for a device request — delivered to the poller and then deleted. */
  issuedToken?: { accessToken: string, expiresIn?: number }
  createdAt: number
  expiresAt: number
}

/** id = `usr:<code>`. Resolves a typed/complete user code to the canonical request id. */
export interface OAuthUserCodeIndexRecord extends ResourceRecord {
  requestId: string
  expiresAt: number
}

/** id = `dev:<hash(device_code)>`. Resolves a polled device code to the canonical request id. */
export interface OAuthDeviceCodeIndexRecord extends ResourceRecord {
  requestId: string
  expiresAt: number
}

/**
 * id = `code:<hash(code)>`. Single-use — consumed with `take()`. Its lifetime is the resource's
 * own TTL option at `create()` time, so unlike the other pending records it carries no
 * `expiresAt` of its own to keep in step with that.
 */
export interface OAuthAuthorizationCodeRecord extends ResourceRecord {
  requestId: string
  clientId: string
  redirectUri: string
  codeChallenge: string
  resource?: string
  subject: OAuthApprovedSubject
}

/** A DCR-registered client, stored with the housekeeping fields a static/CIMD client has no use for. */
export interface OAuthDcrClientRecord extends Omit<OAuthClientRecord, 'origin'>, ResourceRecord {
  createdAt: Date
  updatedAt?: Date
  lastUsedAt?: Date
  origin: 'dcr'
  /** Cleared out (by a real Mongo TTL index) if nothing exchanges a code against this client for
   * a long time. */
  expiresAt: Date
}

export type OAuthPendingResource = Resource<
  OAuthPendingRequestRecord | OAuthUserCodeIndexRecord | OAuthDeviceCodeIndexRecord | OAuthAuthorizationCodeRecord
>
