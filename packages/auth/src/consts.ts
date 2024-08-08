import type { JSONSchemaType } from 'ajv'

export const INCLUDE = '+'
export const EXCLUDE = '-'
export const WILDCARD = '*'
export const DELIMITER = ':'

export const ALL_SCOPES = '*'
export const AUTH_SCOPE = '__auth'

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
  OneTimeToken = 'one-time-token',
  ReCaptcha = 're-captcha',
  // @TODO think if it should be moved from here 
  // - it's too implementation specific
  // OwlMeans specific partial WalletProvider authentication type
  WalletDid = 'wallet-did',
  // Doesn't have explicity plugin - is internal part of rely based plugins
  RelyHandshake = 'rely-handshake',
  WalletConsumer = 'wallet-consumer',
  // Right now this authentication type is ephemeral cause there is no support of
  // abstract non-owlmenas-backend-bound wallets
  WalletProvider = 'wallet-provider',
}

export enum AuthroizationType {
  AuthToken = 'auth-token',
  Ed25519BasicToken = 'ed25519-basic-token',
  Ed25519BasicSignature = 'ed25519-basic-signature'
}

export enum AuthenticationStage {
  Init = 'init',
  Allowence = 'allowence',
  Authenticate = 'authenticate',
  Authentication = 'auhtentication',
  Authenticated = 'authenticated'
}

export const AUTHEN = 'authentication'
export const AUTHEN_INIT = `${AUTHEN}:init`
export const AUTHEN_AUTHEN = `${AUTHEN}:authenticate`

export const CAUTHEN = `client-${AUTHEN}`
export const CAUTHEN_AUTHEN = `${CAUTHEN}:authentication`
export const CAUTHEN_AUTHEN_DEFAULT = `${CAUTHEN}:authentication:default`
export const CAUTHEN_AUTHEN_TYPED = `${CAUTHEN}:authentication:typed`

export const ScopeValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 32 }

export const PermissionValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 8, maxLength: 128 }

export const ResourceValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 8, maxLength: 128 }

export const AttributeValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 8, maxLength: 128 }

export const EntityValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 3, maxLength: 256 }

export const GroupValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 128 }

export const TypeNameSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 64 }

export const EnumValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 32 }

export const IdValueSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 128 }

export const DateSchema: JSONSchemaType<Date> = { type: 'object', format: 'date-time', required: [] }

export const AuthRoleSchema: JSONSchemaType<AuthRole> = {
  type: 'string',
  enum: Object.values(AuthRole)
}

export const DISPATCHER = 'dispatcher'
export const DISPATCHER_AUTHEN = `${DISPATCHER}:authentication`

export const AUTHEN_RELY = `${AUTHEN}-rely`

export const AUTH_HEADER = 'authorization'
export const AUTH_QUERY = 'token'

export const MOD_RECAPTCHA = '_external:re-captcha'
export const CMOD_RECAPTCHA = `_client-${MOD_RECAPTCHA.slice(1)}`

export const GUEST_ID = '__guest'
export const RELY_3RD = 'rely'
