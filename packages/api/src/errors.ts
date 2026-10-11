import { ResilientError } from '@owlmeans/error'
import { parseClientMarker } from './status/marker.js'

export class ApiError extends ResilientError {
  public static override typeName = 'ApiError'

  constructor(message: string = 'error') {
    super(ApiError.typeName, `api:${message}`)
  }
}

/**
 * A request the peer answered with a failure.
 *
 * `status` is the HTTP status the marker in the message states (`api:client:crashed:<id>` is 500,
 * `api:client:auth:<id>` 401, `api:client:forbidden[:<id>]` 403, `api:client:status:<n>[:<id>]`
 * any other); `incidentId` is the server's correlation id when the marker carries one. Only
 * `type` and `message` survive a marshal, so both are rebuilt from the message in
 * `finalizeUnmarshal()`. No class of this family declares a static `httpStatus`: a server that
 * rethrows one answers 500, as before.
 */
export class ApiClientError extends ApiError {
  public static override typeName = 'ApiClientError'

  /** The HTTP status the peer answered with, when the message states one. */
  public status?: number

  constructor(message: string = 'error') {
    super(`client:${message}`)
    this.type = ApiClientError.typeName
    this.applyStatus()
  }

  protected applyStatus(): void {
    const marker = parseClientMarker(this.message)
    this.status = marker?.status
    if (marker?.incidentId != null) {
      this.incidentId ??= marker.incidentId
    }
  }

  override finalizeUnmarshal(): void {
    this.applyStatus()
  }
}

/** The peer answered 500. Marker `api:client:crashed:<incident id | error>`. */
export class ServerCrashedError extends ApiClientError {
  public static override typeName = `${ApiClientError.typeName}ServerCrashed`

  constructor(incidentId?: string) {
    super(`crashed:${incidentId ?? 'error'}`)
    this.type = ServerCrashedError.typeName
  }
}

/** The peer answered 401. Marker `api:client:auth:<incident id | error>`. */
export class ServerAuthError extends ApiClientError {
  public static override typeName = `${ApiClientError.typeName}ServerAuth`

  constructor(incidentId?: string) {
    super(`auth:${incidentId ?? 'error'}`)
    this.type = ServerAuthError.typeName
  }
}

/**
 * The peer answered any other non-2xx status with no typed error in the body — a production
 * incident id, a proxy's HTML page, a framework's JSON. Marker `api:client:status:<n>[:<id>]`.
 */
export class ApiStatusError extends ApiClientError {
  public static override typeName = `${ApiClientError.typeName}Status`

  /** The marker body: `<status>[:<incident id>]`. */
  static encode(status: number, incidentId?: string): string {
    return incidentId != null && incidentId !== '' ? `${status}:${incidentId}` : `${status}`
  }

  constructor(status: number, incidentId?: string)
  /** A marker body (`ApiStatusError.encode`) or a marshaled message — the error registry's path. */
  constructor(message: string)
  constructor(status: number | string = 'error', incidentId?: string) {
    super(`status:${typeof status === 'number' ? ApiStatusError.encode(status, incidentId) : status}`)
    this.type = ApiStatusError.typeName
  }
}

ResilientError.registerErrorClass(ApiError)
ResilientError.registerErrorClass(ApiClientError)
ResilientError.registerErrorClass(ServerCrashedError)
ResilientError.registerErrorClass(ServerAuthError)
ResilientError.registerErrorClass(ApiStatusError)
