
/** Read the first `api:client:*` marker in a text, or `null` when it carries none. */
import { MARKER, NAMED_STATUS } from './consts.local.js'
import type { ClientMarker } from './types.js'

export const parseClientMarker = (text: string): ClientMarker | null => {
  const match = MARKER.exec(text)
  if (match == null) {
    return null
  }
  const [, named, coded, legacy, id] = match
  const code = named != null ? NAMED_STATUS[named] : Number(coded ?? legacy)

  return {
    status: code >= 100 && code <= 599 ? code : undefined,
    // `error` is the placeholder a marker gets when no incident id was known.
    incidentId: id != null && id !== 'error' ? id : undefined,
  }
}
