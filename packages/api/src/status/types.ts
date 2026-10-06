/** The HTTP status the API client stamps on an error it rebuilt from a response body. */
export interface ResponseStatusCarrier {
  responseStatus?: number
  denialKind?: string
}

/** What an `api:client:*` marker states. */
export interface ClientMarker {
  status?: number
  incidentId?: string
}

/** Reads the HTTP status, the incident id and the denial kind a failed call carries. */
export interface ApiStatusHelper {
  /** True only for a server-labelled auth/IAM refusal, never an unrelated 403. */
  isAccessDenied: (error: unknown) => boolean
  /**
   * The HTTP status an error answers to, or `null` when nothing states one.
   *
   * Read in order: the status the API client stamped on the error it rebuilt from a response
   * (`responseStatus`); the status an `ApiClientError` parsed from its marker; the `httpStatus` its
   * class declares — a 4xx always, a 5xx only with `allowServerErrorStatus`, exactly what an
   * `@owlmeans/server-api` boundary answers with; finally an `api:client:*` marker in the message or
   * the type of anything else. This is what lets a browser recognise a refusal from its status
   * alone when a production body carries nothing but an incident id.
   */
  httpStatusOf: (error: unknown) => number | null
  /** The server's incident id carried by an error — its own field, else its marker — or `null`. */
  incidentIdOf: (error: unknown) => string | null
  /**
   * Whether a response body is a production incident body — the bare incident UUID an
   * `@owlmeans/server-api` boundary sends instead of the marshaled error. A development body
   * carries the `ResilientError` separator and is never one.
   */
  isIncidentBody: (data: unknown) => data is string
}
