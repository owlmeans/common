
import { ResilientError } from '@owlmeans/error'
import { AuthManagerError } from '@owlmeans/auth'

export class AuthenCredError extends AuthManagerError {
  public static override typeName: string = `${AuthManagerError.typeName}Cred`

  constructor(message: string = 'error') {
    super(`cred:${message}`)
    this.type = AuthenCredError.typeName
  }
}

ResilientError.registerErrorClass(AuthenCredError)
