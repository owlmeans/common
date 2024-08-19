import type { Auth, AuthCredentials, AuthToken } from './types.js'
import { Ajv } from 'ajv'
import formatsPlugin from 'ajv-formats'
import { AuthCredentialsSchema, AuthSchema } from './allowance/model.js'

const ajv = new Ajv()
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
