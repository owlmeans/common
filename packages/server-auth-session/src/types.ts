import type { InitializedService } from '@owlmeans/context'
import type { ResourceRecord } from '@owlmeans/resource'

export type AuthSessionKind = 'bearer' | 'oidc-access' | 'oidc-refresh' | 'oidc-provider-session'

export type AuthSessionState = 'active' | 'pending' | 'refresh' | 'revoked'

/** Stable storage selector. `entityId` never travels in an authentication envelope. */
export interface AuthSessionSelector {
  entityId: string
  profileId: string
  clientId?: string
}

export interface AuthSessionRecord extends ResourceRecord, AuthSessionSelector {
  id: string
  record: 'session'
  kind: AuthSessionKind
  version: number
  issuedAt: number
  expiresAt: number
}

export interface AuthSessionSubject extends ResourceRecord, AuthSessionSelector {
  id: string
  record: 'subject'
  state: AuthSessionState
  version: number
  expiresAt: number
  operationId?: string
}

export type AuthSessionStoredRecord = AuthSessionRecord | AuthSessionSubject

export type AuthSessionDecision =
  | { state: 'active' | 'refresh'; version: number; expiresAt: number }
  | { state: 'pending' | 'revoked' | 'missing' | 'expired' }

export interface RegisterAuthSession extends AuthSessionSelector {
  id: string
  kind: AuthSessionKind
  issuedAt?: number
  expiresAt?: number
}

export interface AuthSessionManager extends InitializedService {
  register: (session: RegisterAuthSession) => Promise<AuthSessionDecision>
  inspect: (id: string) => Promise<AuthSessionDecision>
  /** Fences all sessions for a profile/client before its authority is changed. */
  fence: (selector: AuthSessionSelector, operationId: string) => Promise<void>
  /** Completes a fence as a claim refresh. */
  refresh: (selector: AuthSessionSelector, operationId: string) => Promise<number>
  /** Completes a fence as a session revocation. */
  revoke: (selector: AuthSessionSelector, operationId: string) => Promise<number>
}

export interface AuthSessionManagerOptions {
  alias?: string
  now?: () => number
}
