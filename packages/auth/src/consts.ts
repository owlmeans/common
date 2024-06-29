
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
  TokenExchange = 'token-exchange',
  OneTimeToken = 'one-time-token'
}

export enum AuthroizationType {
  AuthToken = 'auth-token',
  Ed25519BasicSignature = 'ed25519-basic-signature'
}
