/** The prefix every `ApiClientError` message carries. */
export const API_CLIENT_MARKER = 'api:client:'

/** The marker of an `ApiStatusError`: `api:client:status:<n>[:<incident id>]`. */
export const API_STATUS_MARKER = `${API_CLIENT_MARKER}status:`
