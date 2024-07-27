
import { ResourceError } from '@owlmeans/resource'

export class StateToolingError extends ResourceError {
  public static override typeName = `${ResourceError.typeName}Tooling`

  constructor(msg: string) {
    super(`tooling:${msg}`)
    this.type = StateToolingError.typeName
  }
}

export class StateListenerError extends StateToolingError {
  public static override typeName = `${StateToolingError.typeName}Listener`

  constructor(msg: string) {
    super(`listener:${msg}`)
    this.type = StateListenerError.typeName
  }
}

ResourceError.registerErrorClass(StateToolingError)
ResourceError.registerErrorClass(StateListenerError)
