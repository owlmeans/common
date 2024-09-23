
import { ResilientError } from '@owlmeans/error'

export class ClientModuleError extends ResilientError {
  public static override typeName = 'ClientModuleError'

  constructor(message: string) {
    super(ClientModuleError.typeName, `clinet-module:${message}`)
  }
}

export class ClientValidationError extends ClientModuleError {
  public static override typeName = `${ClientModuleError.typeName}Validation`

  constructor(message: string) {
    super(`validation:${message}`)
    this.type = ClientValidationError.typeName
  }
}


ResilientError.registerErrorClass(ClientModuleError)
ResilientError.registerErrorClass(ClientValidationError)
