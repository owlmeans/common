import { AuthRole, AuthenticationType } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'

const baseAuth = (role: AuthRole, userId: string, token: string): Auth => ({
  type: AuthenticationType.BasicEd25519,
  role,
  userId,
  token,
  isUser: role !== AuthRole.Service && role !== AuthRole.System,
  createdAt: new Date(0),
  scopes: ['*'],
})

export const SUPERUSER: Auth = baseAuth(AuthRole.Superuser, 'superuser-1', 'token-superuser')
export const USER: Auth = baseAuth(AuthRole.User, 'user-1', 'token-user')
export const SERVICE: Auth = baseAuth(AuthRole.Service, 'service-1', 'token-service')
