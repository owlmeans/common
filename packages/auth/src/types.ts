import type { AuthRole } from './consts.js'

export interface AuthCredentials extends AuthPayload {
  challenge: string
  credential: string
  publicKey?: string
  /**
    AuthPayload:
      type: string
      role: AuthRole
      userId: string
      source?: string
      profileId?: string
      expiresAt?: Date
    ProfilePayload:
      groups?: string[]
    Authorization:
      entityId?: string
      scopes: string[]
      permissions?: Permission[]
      attributes?: Attribute[]
      permissioned?: boolean 
      denormalized?: boolean 
   */
}

export interface AuthPayload extends ProfilePayload {
  type: string
  role: AuthRole
  userId: string
  source?: string
  profileId?: string
  expiresAt?: Date
  /**
    ProfilePayload:
      groups?: string[]
    Authorization:
      entityId?: string
      scopes: string[]
      permissions?: Permission[]
      attributes?: Attribute[]
      permissioned?: boolean 
      denormalized?: boolean 
   */
}

export interface Group extends Authorization {
  id: string
  name: string
}

export interface ProfilePayload extends Authorization {
  groups?: string[]
  /**
    Authorization:
      entityId?: string
      scopes: string[]
      permissions?: Permission[]
      attributes?: Attribute[]
      permissioned?: boolean 
      denormalized?: boolean 
   */
}

export interface Authorization {
  entityId?: string
  scopes: string[]
  permissions?: Permission[]
  attributes?: Attribute[]
  /**
   * Whether authorization provides all necessary permissions
   */
  permissioned?: boolean
  /**
   * Whether all permissions resolved
   */
  denormalized?: boolean
}

export interface Profile extends ProfilePayload {
  id: string
  name: string
  credential?: string
  secret?: string
  /**
    ProfilePayload:
      groups?: string[]
    Authorization:
      entityId?: string
      scopes: string[]
      permissions?: Permission[]
      attributes?: Attribute[]
      permissioned?: boolean 
      denormalized?: boolean 
   */
}

export interface Auth extends AuthPayload {
  token: string
  isUser: boolean
  createdAt: string
  expiresAt?: Date
  /**
    AuthPayload:
      type: string
      role: AuthRole
      userId: string
      source?: string
      profileId?: string
      expiresAt?: Date
    ProfilePayload:
      groups?: string[]
    Authorization:
      entityId?: string
      scopes: string[]
      permissions?: Permission[]
      attributes?: Attribute[]
      permissioned?: boolean 
      denormalized?: boolean 
   */
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

export interface AllowanceRequest extends Partial<AuthPayload> {
  type: string
  /**
    AuthPayload:
      type?: string
      role?: AuthRole
      userId?: string
      source?: string
      profileId?: string
      expiresAt?: Date
    ProfilePayload:
      groups?: string[]
    Authorization:
      entityId?: string
      scopes?: string[]
      permissions?: Permission[]
      attributes?: Attribute[]
      permissioned?: boolean 
      denormalized?: boolean 
   */
}

export interface AllowanceResponse {
  challenge: string
}

export interface AuthToken {
  token: string
}
