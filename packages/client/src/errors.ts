
import { ResilientError } from '@owlmeans/error'

export class ClientError extends ResilientError {
  public static override typeName: string = 'ClientError'

  constructor(message: string = 'error') {
    super(ClientError.typeName, `client:${message}`)
  }
}

export class ComponentError extends ClientError {
  public static override typeName: string = `${ClientError.typeName}Component`

  constructor(message: string = 'error') {
    super(`component:${message}`)
    this.type = ComponentError.typeName
  }
}

export class ComponentPropError extends ComponentError {
  public static override typeName: string = `${ComponentError.typeName}Prop`

  constructor(message: string = 'error') {
    super(`prop:${message}`)
    this.type = ComponentPropError.typeName
  }
}

export class ComponentPropUndefined extends ComponentPropError {
  public static override typeName: string = `${ComponentPropError.typeName}Undefined`

  constructor(message: string = 'error') {
    super(`undefined:${message}`)
    this.type = ComponentPropUndefined.typeName
  }
}


ResilientError.registerErrorClass(ClientError)
ResilientError.registerErrorClass(ComponentError)
ResilientError.registerErrorClass(ComponentPropError)
ResilientError.registerErrorClass(ComponentPropUndefined)
ResilientError.registerErrorClass(ComponentPropUndefined)
