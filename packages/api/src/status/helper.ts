import { ResilientError } from '@owlmeans/error'
import { ApiClientError } from '../errors.js'
import { parseClientMarker } from './marker.js'
import { ACCESS_DENIED_KIND } from '../consts.js'
import { UUID } from './consts.local.js'
import type { ApiStatusHelper, ClientMarker, ResponseStatusCarrier } from './types.js'

export const createApiStatusHelper = (): ApiStatusHelper => {
  const isAccessDenied = (error: unknown): boolean =>
    httpStatusOf(error) === 403
    && typeof error === 'object' && error != null
    && (error as ResponseStatusCarrier).denialKind === ACCESS_DENIED_KIND

  const httpStatus = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null

  /** The first `api:client:*` marker in an error's `message`, else in its `type`. */
  const markerOf = (error: object): ClientMarker | null => {
    const { message, type } = error as { message?: unknown, type?: unknown }

    return (typeof message === 'string' ? parseClientMarker(message) : null)
      ?? (typeof type === 'string' ? parseClientMarker(type) : null)
  }

  const httpStatusOf = (error: unknown): number | null => {
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

  const incidentIdOf = (error: unknown): string | null => {
    if (error == null || typeof error !== 'object') {
      return null
    }
    const own = (error as { incidentId?: unknown }).incidentId
    if (typeof own === 'string' && own !== '') {
      return own
    }

    return markerOf(error)?.incidentId ?? null
  }

  const isIncidentBody = (data: unknown): data is string =>
    typeof data === 'string' && !data.includes(ResilientError.separator) && UUID.test(data.trim())

  return { isAccessDenied, httpStatusOf, incidentIdOf, isIncidentBody }
}

export const apiStatusHelper = createApiStatusHelper()
