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
      permissions?: PermissionSet[]
      attributes?: AttributeSet[]
      permissioned?: boolean 
      denormalized?: boolean 
   */
}

export interface AuthPayload extends ProfilePayload {
  type: string
  role: AuthRole
  /**
   * Account id - shouldn't be shared with the services
   * - it's ok to share owner id for supervisor roles double check
   * - ? it should contain derived did in case of cryptographic authentication
   */
  userId: string
  /**
   * Previous challenge
   */
  source?: string
  /**
   * Id of the user inside the service. Preferable generated by the service.
   * @cardinality Service to profile (to user) - one to many.
   */
  profileId?: string
  expiresAt?: Date
  /**
    ProfilePayload:
      groups?: string[]
    Authorization:
      entityId?: string
      scopes: string[]
      permissions?: PermissionSet[]
      attributes?: AttributeSet[]
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
      permissions?: PermissionSet[]
      attributes?: AttributeSet[]
      permissioned?: boolean 
      denormalized?: boolean 
   */
}

export interface Authorization {
  entityId?: string
  scopes: string[]
  permissions?: PermissionSet[]
  attributes?: AttributeSet[]
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
      permissions?: PermissionSet[]
      attributes?: AttributeSet[]
      permissioned?: boolean 
      denormalized?: boolean 
   */
}

export interface Auth extends AuthPayload {
  token: string
  isUser: boolean
  createdAt: Date
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
      permissions?: PermissionSet[]
      attributes?: AttributeSet[]
      permissioned?: boolean 
      denormalized?: boolean 
   */
}

export interface PermissionSet {
  scope: string
  permissions: Capabilties
  resources?: string[]
}

export interface Capabilties {
  [key: string]: boolean | number | null
}

export interface AttributeSet {
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
      permissions?: PermissionSet[]
      attributes?: AttributeSet[]
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
