import { ResilientError } from '@owlmeans/error'
import { StorageApiError } from '@owlmeans/storage-common'

export class FileStreamsError extends ResilientError {
  public static override typeName: string = 'FileStreamsError'

  constructor(message: string = 'error') {
    super(FileStreamsError.typeName, `file-streams:${message}`)
  }
}

/** A URL or address the network policy refuses. */
export class NetworkPolicyError extends FileStreamsError {
  public static override typeName: string = `${FileStreamsError.typeName}NetworkPolicy`

  constructor(message: string = 'error') {
    super(`policy:${message}`)
    this.type = NetworkPolicyError.typeName
  }
}

/** A request that failed: `status:<code>`, `redirects`, `connect`, `headers-timeout`, `truncated`… */
export class HttpError extends FileStreamsError {
  public static override typeName: string = `${FileStreamsError.typeName}Http`

  constructor(message: string = 'error') {
    super(`http:${message}`)
    this.type = HttpError.typeName
  }

  /** The HTTP status of a `status:<code>` failure. */
  public get status(): number | undefined {
    const match = /http:status:(\d+)/.exec(this.message)
    return match != null ? Number(match[1]) : undefined
  }
}

/** A proxy that could not be used: `no-plugin`, `connect`, `auth-failed`, `refused:<code>`… */
export class ProxyError extends FileStreamsError {
  public static override typeName: string = `${FileStreamsError.typeName}Proxy`

  constructor(message: string = 'error') {
    super(`proxy:${message}`)
    this.type = ProxyError.typeName
  }
}

/** A size, time or count ceiling crossed: `max-bytes`, `timeout`, `idle-timeout`, `ratio`… */
export class LimitError extends FileStreamsError {
  public static override typeName: string = `${FileStreamsError.typeName}Limit`

  constructor(message: string = 'error') {
    super(`limit:${message}`)
    this.type = LimitError.typeName
  }
}

/** A source that cannot serve: `consumed`, `changed`, `not-found`, `not-a-file`… */
export class SourceError extends FileStreamsError {
  public static override typeName: string = `${FileStreamsError.typeName}Source`

  constructor(message: string = 'error') {
    super(`source:${message}`)
    this.type = SourceError.typeName
  }
}

/** A path refused: `absolute`, `traversal`, `invalid-char`, `too-long`, `symlink`, `exists`… */
export class PathError extends FileStreamsError {
  public static override typeName: string = `${FileStreamsError.typeName}Path`

  constructor(message: string = 'error') {
    super(`path:${message}`)
    this.type = PathError.typeName
  }
}

/** An archive that cannot be read safely: `format`, `encrypted`, `method:<n>`, `overlap`… */
export class ArchiveError extends FileStreamsError {
  public static override typeName: string = `${FileStreamsError.typeName}Archive`

  constructor(message: string = 'error') {
    super(`archive:${message}`)
    this.type = ArchiveError.typeName
  }
}

/** A URL resolver that could not reach the bytes: `<resolver>:<reason>`. */
export class ResolverError extends FileStreamsError {
  public static override typeName: string = `${FileStreamsError.typeName}Resolver`

  constructor(message: string = 'error') {
    super(`resolver:${message}`)
    this.type = ResolverError.typeName
  }
}

/** A Viable workload write refused or failed: `too-large`, `write-failed`. */
export class WorkloadError extends FileStreamsError {
  public static override typeName: string = `${FileStreamsError.typeName}Workload`

  constructor(message: string = 'error') {
    super(`workload:${message}`)
    this.type = WorkloadError.typeName
  }
}

/** An S3 operation that failed: `s3:<op>`. A storage `StorageApiError`. */
export class S3TransferError extends StorageApiError {
  public static override typeName: string = `${StorageApiError.typeName}S3`

  constructor(message: string = 'error') {
    super(`s3:${message}`)
    this.type = S3TransferError.typeName
  }
}

ResilientError.registerErrorClass(FileStreamsError)
ResilientError.registerErrorClass(NetworkPolicyError)
ResilientError.registerErrorClass(HttpError)
ResilientError.registerErrorClass(ProxyError)
ResilientError.registerErrorClass(LimitError)
ResilientError.registerErrorClass(SourceError)
ResilientError.registerErrorClass(PathError)
ResilientError.registerErrorClass(ArchiveError)
ResilientError.registerErrorClass(ResolverError)
ResilientError.registerErrorClass(WorkloadError)
ResilientError.registerErrorClass(S3TransferError)
