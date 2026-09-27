/**
 * The library-tier i18n resource this package registers under.
 *
 * Every string the panel renders is addressed as `lib : auth-token.panel.<key>`, so an application
 * overrides any of them by registering the same resource at the app tier — see the README.
 */
export const AUTH_TOKEN_I18N = 'auth-token'

/** The lifetimes the create form offers, in days. */
export const TOKEN_EXPIRY_CHOICES = [30, 90, 365] as const

/**
 * The fourth choice, which is the absence of a lifetime.
 *
 * A `Select` carries strings, and `expiresIn` is simply omitted from the request body for this one
 * — `CreateAccessToken` reads an absent lifetime as "no expiry".
 */
export const TOKEN_EXPIRY_NEVER = 'never'

/** `CreateAccessToken.expiresIn` is seconds, while the choices above are days. */
export const DAY_SECONDS = 24 * 60 * 60
