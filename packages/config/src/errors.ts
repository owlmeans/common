
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

export class PluginMissconfigured extends ConfigResourceError {
  public static override typeName = 'PluginMissconfigured'

  constructor(message: string = 'error') {
    super(`plugin-config:${message}`)
    this.type = PluginMissconfigured.typeName
  }
}

ResilientError.registerErrorClass(ConfigError)
ResilientError.registerErrorClass(ConfigResourceError)
ResilientError.registerErrorClass(PluginMissconfigured)
