
export enum AccessLevel {
  Guest = 'guest',
  User = 'user',
  Permissioned = 'permissioned',
  /**
   * The project owner. Authenticated and holding the admin marker, which passes every gate —
   * so this level names a marker, never a list of the project's own permissions.
   */
  Admin = 'admin',
}

/**
 * Alias prefixes of the entrypoints a generated project declares.
 *
 * Everything a target app addresses — a screen or an endpoint — is an entrypoint referenced by
 * alias, and the prefix says which side owns it. The pipeline splits access rules by this prefix
 * alone, so it is load-bearing, not decorative.
 *
 * The split is one-sided on purpose: an alias starting with {@link ALIAS_PREFIX_API} is an API
 * entrypoint, and ANYTHING ELSE is a screen. The framework contributes screen aliases of its own
 * (`base`, `home`, `dispatcher`) that carry no prefix at all, so testing for
 * {@link ALIAS_PREFIX_WEB} would silently drop them.
 */
export const ALIAS_PREFIX_API = 'api:'

/** The prefix every GENERATED screen alias carries — see {@link ALIAS_PREFIX_API} for the split. */
export const ALIAS_PREFIX_WEB = 'web:'

/**
 * The prefix of a LAYOUT entrypoint — the parent a screen hangs under so the layout wraps it.
 * A layout is addressed like a screen and rendered by the same router, so it has to be excluded
 * explicitly wherever "the entrypoint of this screen" is being resolved.
 */
export const ALIAS_PREFIX_WEB_LAYOUT = 'web:layout:'
