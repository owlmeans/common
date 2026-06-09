import { ResilientError } from '@owlmeans/error'

export class IamError extends ResilientError {
  public static override typeName = `Iam${ResilientError.typeName}`

  constructor(message = 'error') {
    super(IamError.typeName, `iam:${message}`)
    this.type = IamError.typeName
  }
}

export class IamClientError extends IamError {
  public static override typeName = `IamClient${ResilientError.typeName}`

  constructor(message = 'error') {
    super(`client:${message}`)
    this.type = IamClientError.typeName
  }
}

export class IamResourceError extends IamError {
  public static override typeName = `IamResource${ResilientError.typeName}`

  constructor(message = 'error') {
    super(`resource:${message}`)
    this.type = IamResourceError.typeName
  }
}

ResilientError.registerErrorClass(IamError)
ResilientError.registerErrorClass(IamClientError)
ResilientError.registerErrorClass(IamResourceError)
