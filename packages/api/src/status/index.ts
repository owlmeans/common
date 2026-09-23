import { ResilientError } from '@owlmeans/error'
import { ApiClientError } from '../errors.js'
import { parseClientMarker } from './marker.js'

export { INCIDENT_ID_HEADER } from '../consts.js'
export { API_CLIENT_MARKER, API_STATUS_MARKER, parseClientMarker } from './marker.js'
export type { ClientMarker } from './marker.js'

/** The HTTP status the API client stamps on an error it rebuilt from a response body. */
export interface ResponseStatusCarrier {
  responseStatus?: number
}

const httpStatus = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null

/** The first `api:client:*` marker in an error's `message`, else in its `type`. */
const markerOf = (error: object) => {
  const { message, type } = error as { message?: unknown, type?: unknown }

  return (typeof message === 'string' ? parseClientMarker(message) : null)
    ?? (typeof type === 'string' ? parseClientMarker(type) : null)
}

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
export const httpStatusOf = (error: unknown): number | null => {
  if (error == null || typeof error !== 'object') {
    return null
  }
  const stamped = httpStatus((error as ResponseStatusCarrier).responseStatus)
  if (stamped != null) {
    return stamped
  }
  if (error instanceof ApiClientError && httpStatus(error.status) != null) {
    return error.status!
  }
  const declaration = error.constructor as { httpStatus?: unknown, allowServerErrorStatus?: unknown } | undefined
  const declared = httpStatus(declaration?.httpStatus)
  if (declared != null && (declared < 500 || declaration?.allowServerErrorStatus === true)) {
    return declared
  }

  return markerOf(error)?.status ?? null
}

/** The server's incident id carried by an error — its own field, else its marker — or `null`. */
export const incidentIdOf = (error: unknown): string | null => {
  if (error == null || typeof error !== 'object') {
    return null
  }
  const own = (error as { incidentId?: unknown }).incidentId
  if (typeof own === 'string' && own !== '') {
    return own
  }

  return markerOf(error)?.incidentId ?? null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether a response body is a production incident body — the bare incident UUID an
 * `@owlmeans/server-api` boundary sends instead of the marshaled error. A development body
 * carries the `ResilientError` separator and is never one.
 */
export const isIncidentBody = (data: unknown): data is string =>
  typeof data === 'string' && !data.includes(ResilientError.separator) && UUID.test(data.trim())
