
import { ResilientError } from '@owlmeans/error'

export class ConfigError extends ResilientError {
  public static override typeName = 'ConfigError'

  constructor(message: string = 'error') {
    super(ConfigError.typeName, `config:${message}`)
  }
}

export class ConfigResourceError extends ConfigError {
  public static override typeName = 'ConfigResourceError'

  constructor(message: string = 'error') {
    super(`resource:${message}`)
    this.type = ConfigResourceError.typeName
  }
}

ResilientError.registerErrorClass(ConfigError)
ResilientError.registerErrorClass(ConfigResourceError)
