
import { ResilientError } from '@owlmeans/error'

export class KeycloakError extends ResilientError {
  public static override typeName: string = 'KeycloakError'

  constructor(message: string = 'error') {
    super(KeycloakError.typeName, `keycloak:${message}`)
  }
}

export class KeycloakTokenError extends KeycloakError {
  public static override typeName: string = `${KeycloakError.typeName}Token`

  constructor(message: string = 'error') {
    super(`token:${message}`)
    this.type = KeycloakTokenError.typeName
  }
}

export class KeycloakConsistencyError extends KeycloakError {
  public static override typeName: string = `${KeycloakError.typeName}Consistency`

  constructor(message: string = 'error') {
    super(`consistency:${message}`)
    this.type = KeycloakConsistencyError.typeName
  }
}

export class KeycloakOrphanUser extends KeycloakConsistencyError {
  public static override typeName: string = `${KeycloakConsistencyError.typeName}OrphanUser`

  constructor(message: string = 'error') {
    super(`orphan:${message}`)
    this.type = KeycloakOrphanUser.typeName
  }
}

export class KeycloakCreationError extends KeycloakError {
  public static override typeName: string = `${KeycloakError.typeName}Creation`

  constructor(message: string = 'error') {
    super(`creation:${message}`)
    this.type = KeycloakCreationError.typeName
  }
}

ResilientError.registerErrorClass(KeycloakError)
ResilientError.registerErrorClass(KeycloakTokenError)
ResilientError.registerErrorClass(KeycloakConsistencyError)
ResilientError.registerErrorClass(KeycloakOrphanUser)
ResilientError.registerErrorClass(KeycloakCreationError)
