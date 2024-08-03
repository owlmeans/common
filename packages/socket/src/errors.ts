import { ResilientError } from '@owlmeans/error'

export class SocketError extends ResilientError {
  public static override typeName: string = 'SocketError'

  constructor(message: string = 'error') {
    super(SocketError.typeName, `socket:${message}`)
  }
}

export class SocketInitializationError extends SocketError {
  public static override typeName: string = `${SocketError.typeName}Initialization`
  
  constructor(message: string = 'error') {
    super(`initialization:${message}`)
    this.type = SocketInitializationError.typeName
  }
}

export class SocketConnectionError extends SocketError {
  public static override typeName: string = `${SocketError.typeName}Connection`
  
  constructor(message: string = 'error') {
    super(`connection:${message}`)
    this.type = SocketConnectionError.typeName
  }
}

export class SocketUnauthorized extends SocketConnectionError {
  public static override typeName: string = `${SocketConnectionError.typeName}Unauthorized`
  
  constructor(message: string = 'error') {
    super(`unauthorized:${message}`)
    this.type = SocketUnauthorized.typeName
  }
}

export class SocketUnsupported extends SocketConnectionError {
  public static override typeName: string = `${SocketConnectionError.typeName}Unsupported`
  
  constructor(message: string = 'error') {
    super(`unsupported:${message}`)
    this.type = SocketUnsupported.typeName
  }
}

export class SocketTimeout extends SocketError {
  public static override typeName: string = `${SocketError.typeName}Timeout`
  
  constructor(message: string = 'error') {
    super(`timeout:${message}`)
    this.type = SocketTimeout.typeName
  }
}

export class SocketMessageError extends SocketError {
  public static override typeName: string = `${SocketError.typeName}Message`
  
  constructor(message: string = 'error') {
    super(`message:${message}`)
    this.type = SocketMessageError.typeName
  }
}

export class SocketMessageMalformed extends SocketMessageError {
  public static override typeName: string = `${SocketMessageError.typeName}Malformed`
  
  constructor(message: string = 'error') {
    super(`malformed:${message}`)
    this.type = SocketMessageMalformed.typeName
  }
}

ResilientError.registerErrorClass(SocketError)
ResilientError.registerErrorClass(SocketInitializationError)
ResilientError.registerErrorClass(SocketConnectionError)
ResilientError.registerErrorClass(SocketUnauthorized)
ResilientError.registerErrorClass(SocketUnsupported)
ResilientError.registerErrorClass(SocketTimeout)
ResilientError.registerErrorClass(SocketMessageError)
ResilientError.registerErrorClass(SocketMessageMalformed)
