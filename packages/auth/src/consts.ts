import type { JSONSchemaType } from 'ajv'

export const INCLUDE = '+'
export const EXCLUDE = '-'
export const WILDCARD = '*'
export const DELIMITER = ':'

export enum AuthRole {
  User = 'user',
  Guest = 'guest',
  Service = 'service',
  System = 'system',
  Admin = 'admin',
  Superuser = 'superuser',
  Blocked = 'blocked'
}

export enum AuthenticationType {
  BasicEd25519 = 'basic-ed25519',
  OneTimeToken = 'one-time-token'
}

export enum AuthroizationType {
  AuthToken = 'auth-token',
  Ed25519BasicSignature = 'ed25519-basic-signature'
}

export enum AuthenticationStage {
  Init = 'init',
  Allowence = 'allowence',
  Authenticate = 'authenticate',
  Authentication = 'auhtentication',
  Auhtenticated = 'authenticated'
}

export const AUTHEN = 'authentication'
export const AUTHEN_INIT = `${AUTHEN}:init`
export const AUTHEN_AUTHEN = `${AUTHEN}:authenticate`

export const CAUTHEN = `cleint-${AUTHEN}`
export const CAUTHEN_AUTHEN = `${CAUTHEN}:authentication`

export const ScopeValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 32 }

export const PermissionValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 8, maxLength: 128 }

export const ResourceValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 8, maxLength: 128 }

export const AttributeValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 8, maxLength: 128 }

export const EntityValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 20, maxLength: 128 }

export const GroupValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 128 }

export const TypeNameSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 64 }

export const EnumValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 32 }

export const IdValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 128 }

export const AuthRoleSchema: JSONSchemaType<AuthRole> = {
  type: 'string',
  enum: ['admin', 'user', 'guest', 'service', 'system', 'blocked', 'superuser']
}
