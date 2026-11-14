/** The characters a substitution or an insertion tries. */
export const PACKAGE_NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789-._'

/** The separators a name's words are joined with. */
export const PACKAGE_NAME_SEPARATORS: readonly string[] = Object.freeze(['-', '.', '_'])

/** Suffixes a library name commonly carries or drops. */
export const PACKAGE_NAME_SUFFIXES: readonly string[] = Object.freeze(['js', '-js', '.js'])

/** Prefixes a library name commonly carries or drops. */
export const PACKAGE_NAME_PREFIXES: readonly string[] = Object.freeze(['node-'])

/** The default bound of `variants`. */
export const PACKAGE_VARIANT_LIMIT = 1024

/** The longest package name a registry accepts. */
export const PACKAGE_NAME_MAX_LENGTH = 214

/** A registry-shaped package name: an optional `@scope/`, lowercase URL-safe characters, no leading `.` or `_`. */
export const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/
