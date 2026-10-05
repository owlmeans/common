import { apiStatusHelper } from './helper.js'

export { INCIDENT_ID_HEADER } from '../consts.js'
export { DENIAL_KIND_HEADER, ACCESS_DENIED_KIND } from '../consts.js'
export { parseClientMarker } from './marker.js'
export { API_CLIENT_MARKER, API_STATUS_MARKER } from './consts.js'
export type { ClientMarker, ResponseStatusCarrier, ApiStatusHelper } from './types.js'
export { apiStatusHelper, createApiStatusHelper } from './helper.js'

/** @deprecated compat:factory-refactor — use `apiStatusHelper.httpStatusOf(…)` */
export const httpStatusOf = (error: unknown): number | null => apiStatusHelper.httpStatusOf(error)
