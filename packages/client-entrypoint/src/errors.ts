
import { ResilientError } from '@owlmeans/error'

export class ClientEntrypointError extends ResilientError {
  public static override typeName = 'ClientModuleError'

  constructor(message: string) {
    super(ClientEntrypointError.typeName, `clinet-module:${message}`)
  }
}

export class ClientValidationError extends ClientEntrypointError {
  public static override typeName = `${ClientEntrypointError.typeName}Validation`

  constructor(message: string) {
    super(`validation:${message}`)
    this.type = ClientValidationError.typeName
  }
}


ResilientError.registerErrorClass(ClientEntrypointError)
ResilientError.registerErrorClass(ClientValidationError)
