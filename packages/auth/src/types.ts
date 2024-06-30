import type { AuthRole } from './consts.js'

export interface AuthCredentials extends AuthPayload {
  challenge: string
  credType: string
}

export interface AuthPayload extends ProfilePayload {
  type: string
  role: AuthRole
  source?: string
  userId?: string
  profileId?: string
  expiresAt?: Date
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
  permissioned?: boolean
  denormalized?: boolean
}

export interface Profile extends ProfilePayload {
  id: string
  name: string
}

export interface Auth extends AuthPayload {
  token: string
  isUser: boolean
  createdAt: Date
  expiresAt: Date
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
