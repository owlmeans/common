import { ResilientError } from '@owlmeans/error'
import { AuthManagerError } from '../../errors.js'

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

ResilientError.registerErrorClass(AuthPluginError)
ResilientError.registerErrorClass(TypeMissmatchError)
