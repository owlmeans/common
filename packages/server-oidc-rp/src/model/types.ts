import type { Auth } from '@owlmeans/auth'
import type { OidcClientAdapter } from '../types.js'
import type { ResponseMode } from './consts.js'

export interface GateModel {
  getClient: (user: Auth) => Promise<OidcClientAdapter>

  loadPermissions: (user: Auth, permissions: string[]) => Promise<string[]>

  fixPermissions: (permissions: string[], user: Auth) => string[]

  prepareRequest: (client: OidcClientAdapter, request: PermissionRequest) => Promise<RequestInit>

  makeRequest: (permissions: string[], client: OidcClientAdapter) => Promise<PermissionRequest>
}

export interface PermissionRequest {
  grant_type: string
  audience: string
  client_id?: string
  secret?: string
  subject_token?: string
  permission: string | string[]
  response_mode: ResponseMode
}

export interface PermissionResponse {
  rsid: string
  rsname: string
  scopes?: string[]
}
