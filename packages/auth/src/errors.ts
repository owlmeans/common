
import { ResilientError } from '@owlmeans/error'

export class AuthError extends ResilientError {
  public static override typeName: string = 'AuthError'

  constructor(message: string = 'error') {
    super(ResilientError.typeName, `auth:${message}`)
  }
}

export class AuthUnknown extends AuthError {
  public static override typeName: string = `${AuthError.typeName}Unknown`
  
  constructor(message: string = 'error') {
    super(`unknown:${message}`)
  }
}

export class AuthManagerError extends AuthError {
  public static override typeName: string = 'AuthManagerError'

  constructor(message: string = 'error') {
    super(`manager:${message}`)
  }
}

export class AuthenFailed extends AuthManagerError {
  public static override typeName: string = `${AuthManagerError.typeName}AuthenFailed`

  constructor(message: string = 'error') {
    super(`authen:${message}`)
  }
}

export class AuthenPayloadError extends AuthenFailed {
  public static override typeName: string = `${AuthenFailed.typeName}Payload`

  constructor(message: string = 'error') {
    super(`payload:${message}`)
  }
}

export class AuthPluginError extends AuthManagerError {
  public static override typeName: string = `${AuthManagerError.typeName}Plugin`

  constructor(message: string = 'error') {
    super(`plugin:${message}`)
  }
}

export class TypeMissmatchError extends AuthPluginError {
  public static override typeName: string = `${AuthPluginError.typeName}TypeMissmatch`

  constructor(message: string = 'error') {
    super(`missmatch:${message}`)
  }
}

export class AuthorizationError extends AuthError {
  public static override typeName: string = 'AuthorizationError'

  constructor(message: string = 'error') {
    super(`authorization:${message}`)
  }
}

ResilientError.registerErrorClass(AuthError)
ResilientError.registerErrorClass(AuthUnknown)
ResilientError.registerErrorClass(AuthManagerError)
ResilientError.registerErrorClass(AuthenFailed)
ResilientError.registerErrorClass(AuthenPayloadError)
ResilientError.registerErrorClass(AuthPluginError)
ResilientError.registerErrorClass(TypeMissmatchError)
ResilientError.registerErrorClass(AuthorizationError)
