import type { AuthRole } from './consts.js'

export interface AuthCredentials extends AuthPayload {
  challenge: string
  credential: string
}

export interface AuthPayload extends ProfilePayload {
  type: string
  role: AuthRole
  source?: string
  userId?: string
  profileId?: string
  expiresAt?: string
}

export interface Group extends Authorization {
  id: string
  name: string
}

export interface ProfilePayload extends Authorization {
  groups?: string[]
}

export interface Authorization {
  entityId?: string
  scopes: string[]
  permissions?: Permission[]
  attributes?: Attribute[]
  // Whether authorization provides all necessary permissions
  permissioned?: boolean 
  // Wheter all permissions resolved
  denormalized?: boolean 
}

export interface Profile extends ProfilePayload {
  id: string
  name: string
  extras?: string
}

export interface Auth extends AuthPayload {
  token: string
  isUser: boolean
  createdAt: string
  expiresAt: string
}

export interface Permission {
  scope: string
  permissions: string[]
  resources: string[]
}

export interface Attribute {
  scope: string
  attributes: string[]
}

export interface AllowenceRequest extends Partial<AuthPayload> {
  type: string
}

export interface AllowenceResponse {
  allow: boolean
  challenge: string
  scopes: string[]
}

export interface AuthToken {
  token: string
}
