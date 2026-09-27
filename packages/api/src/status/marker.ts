/** The prefix every `ApiClientError` message carries. */
export const API_CLIENT_MARKER = 'api:client:'

/** The marker of an `ApiStatusError`: `api:client:status:<n>[:<incident id>]`. */
export const API_STATUS_MARKER = `${API_CLIENT_MARKER}status:`

/**
 * `crashed` / `auth` / `forbidden` / `status:<n>` / the legacy bare `<n>`, then an optional
 * `:<incident id>`. The look-ahead refuses a match that runs on into more marker text, so a
 * doubled prefix (a subclass constructor handed a whole marshaled message) resolves to the inner,
 * complete marker.
 */
const MARKER = /api:client:(?:(crashed|auth|forbidden)|status:(\d{3})|(\d{3}))(?::([\w.-]{1,128}))?(?![\w.:-])/

const NAMED_STATUS: Record<string, number> = { crashed: 500, auth: 401, forbidden: 403 }

/** What an `api:client:*` marker states. */
export interface ClientMarker {
  status?: number
  incidentId?: string
}

/** Read the first `api:client:*` marker in a text, or `null` when it carries none. */
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
