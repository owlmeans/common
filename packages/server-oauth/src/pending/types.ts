import type {
  OAuthAuthorizationCodeRecord, OAuthPendingRequestRecord
} from '../types.js'

/** A pending request found by its ref or its device code: the canonical id and the record. */
export interface OAuthPendingMatch {
  id: string
  record: OAuthPendingRequestRecord
}

/**
 * The short-lived records of one context's authorization server — requests, the user-code and
 * device-code indexes, and authorization codes — all in one resource, distinguished by id prefix.
 */
export interface OAuthPendingHelper {
  /** Which resource this deployment stores pending requests in — configurable, defaulted. */
  pendingResourceAliasOf: () => string
  createRequest: (id: string, record: Omit<OAuthPendingRequestRecord, 'id'>) => Promise<void>
  loadRequestById: (id: string) => Promise<OAuthPendingRequestRecord | null>
  saveRequest: (id: string, record: OAuthPendingRequestRecord) => Promise<void>
  deleteRequest: (id: string) => Promise<void>
  /**
   * What the consent screen's `:ref` param resolves through: a canonical request id (the code
   * grant's redirect names one directly) or a normalized user code (what a person typed, or what
   * `verification_uri_complete` carried) — the caller never has to know which kind of request it
   * is before asking.
   */
  resolveRequestRef: (ref: string) => Promise<OAuthPendingMatch | null>
  /**
   * A request the consent screen may still act on: resolved by `ref`, unexpired and still pending.
   *
   * @throws {OAuthRequestNotFound} for an unknown ref or a request already decided
   * @throws {OAuthRequestExpired} for a request past its deadline
   */
  requirePending: (ref: string) => Promise<OAuthPendingMatch>
  createUserCodeIndex: (userCode: string, requestId: string, expiresAt: number) => Promise<void>
  deleteUserCodeIndex: (userCode: string) => Promise<void>
  createDeviceCodeIndex: (deviceCodeHash: string, requestId: string, expiresAt: number) => Promise<void>
  loadRequestByDeviceCodeHash: (deviceCodeHash: string) => Promise<OAuthPendingMatch | null>
  deleteDeviceCodeIndex: (deviceCodeHash: string) => Promise<void>
  createAuthorizationCode: (codeHash: string, record: Omit<OAuthAuthorizationCodeRecord, 'id'>) => Promise<void>
  /** `null` for an unknown or already-consumed code — a replay reads exactly like a wrong one. */
  takeAuthorizationCode: (codeHash: string) => Promise<OAuthAuthorizationCodeRecord | null>
}
