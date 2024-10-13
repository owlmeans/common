import type { TokenRequest } from './types.js'
import { decodeJwt } from 'jose'
import { KeycloakTokenError } from '../errors.js'
import type { RequestParams } from '../types.js'

export const prepareToken = (token: string | RequestParams): TokenRequest => {
  const params = typeof token === 'string' ? { token } : token
  const jwt = decodeJwt(params.token)

  if (params.realm == null) {
    const parts = jwt.iss?.split('/') ?? []

    if (parts.length < 2) {
      throw new KeycloakTokenError('iss')
    }

    params.realm = parts[parts.length - 1]
  }

  return {
    params: { realm: params.realm },
    headers: { Authorization: `bearer ${params.token}` }
  }
}
