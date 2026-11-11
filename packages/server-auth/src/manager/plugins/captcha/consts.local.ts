/**
 * The only credential fields a captcha guest token keeps. Everything else the caller posted — a
 * profile, an organization (`entitySlug` or `entityId`), permissions, groups, an expiry, a `source`
 * — is dropped: the token proves a solved challenge, never an identity.
 */
export const CAPTCHA_CREDENTIAL_FIELDS: readonly string[] = Object.freeze([
  'type', 'role', 'userId', 'scopes', 'challenge', 'credential',
])
