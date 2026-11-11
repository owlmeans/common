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

/**
 * A media part (an image, a document) cannot be sent. Fatal in every retry loop: no attempt, rung
 * or climb changes the bytes, their type or the models that accept them.
 */
export class LlmMediaError extends LlmError {
  public static override typeName = `Media${LlmError.typeName}`

  constructor(message: string = 'error') {
    super(`media:${message}`)
    this.type = LlmMediaError.typeName
  }
}

/** The part's type is not accepted (an image other than png/jpeg/gif/webp, a non-PDF document), or its bytes are not what its type says. */
export class LlmMediaTypeError extends LlmMediaError {
  public static override typeName = `Type${LlmMediaError.typeName}`

  constructor(message: string = 'error') {
    super(`type:${message}`)
    this.type = LlmMediaTypeError.typeName
  }
}

/** A documented provider limit is exceeded — a part's size or side, or a request's count or total. Nothing is resized. */
export class LlmMediaLimitError extends LlmMediaError {
  public static override typeName = `Limit${LlmMediaError.typeName}`

  /** The limit that was exceeded. */
  public limit?: number

  /** What the part or request measured. */
  public actual?: number

  constructor(message: string = 'error') {
    super(`limit:${message}`)
    this.type = LlmMediaLimitError.typeName
  }
}

/** No rung of the role accepts what the call carries (`ModelConfig.vision` / `documents`). */
export class LlmMediaUnsupportedError extends LlmMediaError {
  public static override typeName = `Unsupported${LlmMediaError.typeName}`

  constructor(message: string = 'error') {
    super(`unsupported:${message}`)
    this.type = LlmMediaUnsupportedError.typeName
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
ResilientError.registerErrorClass(LlmMediaError)
ResilientError.registerErrorClass(LlmMediaTypeError)
ResilientError.registerErrorClass(LlmMediaLimitError)
ResilientError.registerErrorClass(LlmMediaUnsupportedError)
