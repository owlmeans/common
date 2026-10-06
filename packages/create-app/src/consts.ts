/** npm-safe package slug: lowercase alphanumerics and inner dashes, 1–32 chars. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

/** Loose BCP-47 shape — enough to keep junk out of `<html lang>` without shipping a registry. */
export const LANG_PATTERN = /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/

export const DEFAULT_LANG = 'en'
