export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `crashed` / `auth` / `forbidden` / `status:<n>` / the legacy bare `<n>`, then an optional
 * `:<incident id>`. The look-ahead refuses a match that runs on into more marker text, so a
 * doubled prefix (a subclass constructor handed a whole marshaled message) resolves to the inner,
 * complete marker.
 */
export const MARKER = /api:client:(?:(crashed|auth|forbidden)|status:(\d{3})|(\d{3}))(?::([\w.-]{1,128}))?(?![\w.:-])/

export const NAMED_STATUS: Record<string, number> = { crashed: 500, auth: 401, forbidden: 403 }
