import { ResilientError } from '@owlmeans/error'

export class LlmReaderError extends ResilientError {
  public static override typeName = `LlmReader${ResilientError.typeName}`

  constructor(message: string = 'error') {
    super(LlmReaderError.typeName, `llm-reader:${message}`)
  }
}

/** A page could not be fetched: a network failure, a status the caller did not accept, a limit. */
export class ReaderFetchError extends LlmReaderError {
  public static override typeName = `Fetch${LlmReaderError.typeName}`

  public status?: number

  public url?: string

  constructor(message: string = 'error') {
    super(`fetch:${message}`)
    this.type = ReaderFetchError.typeName
  }
}

/**
 * The proxy, not the target, failed: refused or dropped the connection, wanted credentials, or
 * would have been bypassed (`NO_PROXY`). `proxy` is the masked proxy id — never its credentials.
 */
export class ReaderProxyError extends ReaderFetchError {
  public static override typeName = `Proxy${ReaderFetchError.typeName}`

  public proxy?: string

  constructor(message: string = 'error') {
    super(`proxy:${message}`)
    this.type = ReaderProxyError.typeName
  }
}

/** The address guard refused a target — private, loopback, link-local or metadata space. */
export class ReaderRefusedError extends LlmReaderError {
  public static override typeName = `Refused${LlmReaderError.typeName}`

  constructor(message: string = 'error') {
    super(`refused:${message}`)
    this.type = ReaderRefusedError.typeName
  }
}

/** The answer is not something a reader reads: an unsupported content type, a body over the limit. */
export class ReaderContentError extends LlmReaderError {
  public static override typeName = `Content${LlmReaderError.typeName}`

  constructor(message: string = 'error') {
    super(`content:${message}`)
    this.type = ReaderContentError.typeName
  }
}

/** The reader is missing what a task needs — a model, a helper execution for DOM mode, a renderer. */
export class ReaderConfigError extends LlmReaderError {
  public static override typeName = `Config${LlmReaderError.typeName}`

  constructor(message: string = 'error') {
    super(`config:${message}`)
    this.type = ReaderConfigError.typeName
  }
}

/** A model-backed analysis produced nothing usable. */
export class ReaderAnalysisError extends LlmReaderError {
  public static override typeName = `Analysis${LlmReaderError.typeName}`

  constructor(message: string = 'error') {
    super(`analysis:${message}`)
    this.type = ReaderAnalysisError.typeName
  }
}

ResilientError.registerErrorClass(LlmReaderError)
ResilientError.registerErrorClass(ReaderFetchError)
ResilientError.registerErrorClass(ReaderProxyError)
ResilientError.registerErrorClass(ReaderRefusedError)
ResilientError.registerErrorClass(ReaderContentError)
ResilientError.registerErrorClass(ReaderConfigError)
ResilientError.registerErrorClass(ReaderAnalysisError)
