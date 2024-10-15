import { AUTH_HEADER, AuthroizationType } from '@owlmeans/auth'
import type { AbstractRequest } from '@owlmeans/module'

export const extractAuthToken = (
  req: Partial<AbstractRequest>, 
  type: string | null = AuthroizationType.Ed25519BasicToken, 
  onlyValue: boolean = true
): string | null => {
  let authorization = req.headers?.[AUTH_HEADER]
  authorization = Array.isArray(authorization) ? authorization[0] : authorization

  if (authorization == null) {
    return null
  }

  const [prefix, ...rest] = authorization.split(' ')
  if (type == null) {
    return onlyValue ? rest.join(' ') : authorization
  }

  return prefix === type.toUpperCase() ?
    onlyValue ? rest.join(' ') : authorization
    : null
}
