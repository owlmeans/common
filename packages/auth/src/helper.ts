import type { Auth, AuthCredentials, AuthToken, Authorization } from './types.js'
import { Ajv } from 'ajv'
import formatsPlugin from 'ajv-formats'
import { AuthCredentialsSchema, AuthSchema } from './allowance/model.js'

const ajv = new Ajv({ strict: false })
// @TODO There is some serious type mismatch probably because of wrong versions resolution
formatsPlugin(ajv as any)

export const verifyAuth = (auth: Auth): boolean => {
  const validate = ajv.compile(AuthSchema)

  return validate(auth)
}

export const verifyAuthCredentials = (auth: AuthCredentials): boolean => {
  const validate = ajv.compile(AuthCredentialsSchema)

  return validate(auth)
}

export const isAuth = (auth: unknown): auth is Auth =>
  typeof auth === 'object' && auth != null
  && ("token" in auth) && ("isUser" in auth)

export const isAuthCredentials = (auth: unknown): auth is AuthCredentials =>
  typeof auth === 'object' && auth != null
  && ("challenge" in auth) && ("credential" in auth)

export const isAuthToken = (auth: unknown): auth is AuthToken =>
  typeof auth === 'object' && auth != null
  && ("token" in auth) && typeof auth.token === 'string'

/**
 * The organization slug carried by an auth payload, tolerating tokens minted before the field
 * was named.
 *
 * Tokens outlive deployments: one signed with the previous release still arrives with the value
 * under `entityId`, and it stays valid until it expires. Everything that reads the organization
 * off a payload goes through here so that window needs no second code path — and so the day the
 * fallback can be deleted is a single-line change rather than an audit.
 */
export const entitySlugOf = (payload?: Partial<Authorization> | null): string | undefined =>
  payload?.entitySlug ?? (payload as { entityId?: string } | null | undefined)?.entityId
