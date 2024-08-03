import { ResilientError } from '@owlmeans/error'

export class SocketError extends ResilientError {
  public static override typeName: string = 'SocketError'

  constructor(message: string = 'error') {
    super(SocketError.typeName, `socket:${message}`)
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
ResilientError.registerErrorClass(SocketTimeout)
ResilientError.registerErrorClass(SocketMessageError)
ResilientError.registerErrorClass(SocketMessageMalformed)
