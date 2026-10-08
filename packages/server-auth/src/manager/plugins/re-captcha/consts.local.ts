/**
 * The only credential fields a reCAPTCHA guest token keeps. Everything else the caller posted —
 * a profile, an organization (`entitySlug` or `entityId`), permissions, groups, an expiry, a
 * `source` — is dropped: the token proves a solved challenge, never an identity.
 */
export const RECAPTCHA_CREDENTIAL_FIELDS: readonly string[] = Object.freeze([
  'type', 'role', 'userId', 'scopes', 'challenge', 'credential',
])
