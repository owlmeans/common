import type { Auth, AuthCredentials, AuthToken, Authorization } from './types.js'
import { Ajv } from 'ajv'
import formatsPlugin from 'ajv-formats'
import { AuthCredentialsSchema, AuthSchema } from './allowance/schemas.js'
import type { AuthHelper } from './helper/types.js'

export const createAuthHelper = (): AuthHelper => {
  const ajv = new Ajv({ strict: false })
  // @TODO There is some serious type mismatch probably because of wrong versions resolution
  formatsPlugin(ajv as any)

  const verifyAuth = (auth: Auth): boolean => {
    const validate = ajv.compile(AuthSchema)

    return validate(auth)
  }

  const verifyAuthCredentials = (auth: AuthCredentials): boolean => {
    const validate = ajv.compile(AuthCredentialsSchema)

    return validate(auth)
  }

  const isAuth = (auth: unknown): auth is Auth =>
    typeof auth === 'object' && auth != null
    && ("token" in auth) && ("isUser" in auth)

  const isAuthCredentials = (auth: unknown): auth is AuthCredentials =>
    typeof auth === 'object' && auth != null
    && ("challenge" in auth) && ("credential" in auth)

  const isAuthToken = (auth: unknown): auth is AuthToken =>
    typeof auth === 'object' && auth != null
    && ("token" in auth) && typeof auth.token === 'string'

  const entitySlugOf = (payload?: Partial<Authorization> | null): string | undefined =>
    payload?.entitySlug ?? (payload as { entityId?: string } | null | undefined)?.entityId

  return { verifyAuth, verifyAuthCredentials, isAuth, isAuthCredentials, isAuthToken, entitySlugOf }
}

export const authHelper = createAuthHelper()

/** @deprecated compat:factory-refactor — use `authHelper.isAuth(…)` */
export const isAuth = (auth: unknown): auth is Auth => authHelper.isAuth(auth)

/** @deprecated compat:factory-refactor — use `authHelper.isAuthCredentials(…)` */
export const isAuthCredentials = (auth: unknown): auth is AuthCredentials => authHelper.isAuthCredentials(auth)

/** @deprecated compat:factory-refactor — use `authHelper.isAuthToken(…)` */
export const isAuthToken = (auth: unknown): auth is AuthToken => authHelper.isAuthToken(auth)

/** @deprecated compat:factory-refactor — use `authHelper.entitySlugOf(…)` */
export const entitySlugOf = (payload?: Partial<Authorization> | null): string | undefined =>
  authHelper.entitySlugOf(payload)
