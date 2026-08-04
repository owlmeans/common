import { ResilientError } from '@owlmeans/error'

export class LlmError extends ResilientError {
  public static override typeName = `Llm${ResilientError.typeName}`

  constructor(message: string = 'error') {
    super(LlmError.typeName, `llm:${message}`)
  }
}

/**
 * A model call produced something unusable (null/empty content, failed validation,
 * a rejected filter, a stalled stream). **Retryable** — `withRetry` swallows it and
 * escalates to the next attempt.
 */
export class LlmModelError extends LlmError {
  public static override typeName = `Model${LlmError.typeName}`

  public retry: number = 0

  constructor(message: string = 'error') {
    super(`model:${message}`)
    this.type = LlmModelError.typeName
  }
}

/** A model alias has no config, or its config names no provider/secret/plugin. */
export class LlmMissconfiguredError extends LlmError {
  public static override typeName = `Missconfigured${LlmError.typeName}`

  constructor(message: string = 'error') {
    super(`missconfigured:${message}`)
    this.type = LlmMissconfiguredError.typeName
  }
}

/** No provider plugin is registered for the requested type / model instance. */
export class LlmPluginError extends LlmError {
  public static readonly NO_PLUGIN = 'no-plugin'

  public static override typeName = `Plugin${LlmError.typeName}`

  constructor(message: string = 'error') {
    super(`plugin:${message}`)
    this.type = LlmPluginError.typeName
  }
}

/** Every attempt failed. `cause` carries the last error, `attempt` the last index. */
export class LlmRetryExceededError extends LlmError {
  public static override typeName = `RetryExceeded${LlmError.typeName}`

  public attempt: number = 0

  constructor(message: string = 'error') {
    super(`retry-exceeded:${message}`)
    this.type = LlmRetryExceededError.typeName
  }
}

ResilientError.registerErrorClass(LlmError)
ResilientError.registerErrorClass(LlmModelError)
ResilientError.registerErrorClass(LlmMissconfiguredError)
ResilientError.registerErrorClass(LlmPluginError)
ResilientError.registerErrorClass(LlmRetryExceededError)
