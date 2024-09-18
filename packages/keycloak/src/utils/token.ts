import type { TokenRequest } from './types.js'
import { decodeJwt } from 'jose'
import { KeycloakTokenError } from '../errors.js'

export const prepareToken = (token: string): TokenRequest => {
  const jwt = decodeJwt(token)

  const parts = jwt.iss?.split('/') ?? []

  if (parts.length < 2) {
    throw new KeycloakTokenError('iss')
  }

  return {
    params: { realm: parts[parts.length - 1] },
    headers: { Authorization: `bearer ${token}` }
  }
}
