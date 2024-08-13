import { ResilientError } from '@owlmeans/error'

export class DIDError extends ResilientError {
  public static override typeName = 'DIDError'

  constructor(message: string = 'error') {
    super(DIDError.typeName, `did:${message}`)
  }
}

export class DIDKeyError extends DIDError {
  public static override typeName = `${DIDError.typeName}:Key`

  constructor(message: string = 'error') {
    super(`wallet:${message}`)
    this.type = DIDKeyError.typeName
  }
}

export class DIDWalletError extends DIDError {
  public static override typeName = `${DIDError.typeName}:Wallet`

  constructor(message: string = 'error') {
    super(`wallet:${message}`)
    this.type = DIDWalletError.typeName
  }
}

export class DIDWalletPermissionError extends DIDWalletError {
  public static override typeName = `${DIDWalletError.typeName}:Permission`

  constructor(message: string = 'error') {
    super(`permission:${message}`)
    this.type = DIDWalletPermissionError.typeName
  }
}

export class DIDInitializationError extends DIDWalletError {
  public static override typeName = `${DIDWalletError.typeName}:Initialization`

  constructor(message: string = 'error') {
    super(`init:${message}`)
    this.type = DIDInitializationError.typeName
  }
}

ResilientError.registerErrorClass(DIDError)
ResilientError.registerErrorClass(DIDKeyError)
ResilientError.registerErrorClass(DIDWalletError)
ResilientError.registerErrorClass(DIDWalletPermissionError)
ResilientError.registerErrorClass(DIDInitializationError)
