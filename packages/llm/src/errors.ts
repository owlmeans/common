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

/**
 * A caller REFUSED what the model answered, and says why. Thrown by a `filter`; retryable like any
 * {@link LlmModelError}, with the same `filter-rejected:` prefix. `details` is the caller's own
 * account of what was wrong — the input its `guide` turns into the correction the next attempt
 * reads.
 */
export class LlmOutputRejection extends LlmModelError {
  public static override typeName = `OutputRejection${LlmModelError.typeName}`

  public details: unknown

  constructor(reason: string = 'rejected', details?: unknown) {
    super(`filter-rejected:${reason}`)
    this.type = LlmOutputRejection.typeName
    this.details = details
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

/**
 * A provider-hosted web search failed: the provider answered an error status, an error body, or
 * nothing usable. `status` is the HTTP status when there was one; a 400 is fatal like every other
 * malformed request, a 429 or 5xx is retried. `detail` never carries a credential.
 */
export class LlmSearchError extends LlmError {
  public static override typeName = `Search${LlmError.typeName}`

  public status?: number

  public code?: string

  public provider?: string

  /** How long the provider asked to wait before a retry, in ms. */
  public retryAfter?: number

  public detail?: string

  constructor(message: string = 'error') {
    super(`search:${message}`)
    this.type = LlmSearchError.typeName
  }
}

/**
 * The config cannot run a web search: its provider has no search dialect (a delegated model), the
 * compatible host is unknown, or the call asks for a constraint the dialect cannot honour. A
 * misconfiguration — fatal on the first attempt.
 */
export class LlmSearchUnsupportedError extends LlmMissconfiguredError {
  public static override typeName = `SearchUnsupported${LlmMissconfiguredError.typeName}`

  constructor(message: string = 'error') {
    super(`search-unsupported:${message}`)
    this.type = LlmSearchUnsupportedError.typeName
  }
}

ResilientError.registerErrorClass(LlmError)
ResilientError.registerErrorClass(LlmModelError)
ResilientError.registerErrorClass(LlmOutputRejection)
ResilientError.registerErrorClass(LlmMissconfiguredError)
ResilientError.registerErrorClass(LlmPluginError)
ResilientError.registerErrorClass(LlmRetryExceededError)
ResilientError.registerErrorClass(LlmSearchError)
ResilientError.registerErrorClass(LlmSearchUnsupportedError)
