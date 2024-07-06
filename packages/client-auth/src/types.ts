import type { Config } from '@owlmeans/client-context'
import type { BasicContext } from './utils/types.js'
import type { makeContext } from './context.js'
import type { Auth, AuthToken } from '@owlmeans/auth'
import type {  GuardService } from '@owlmeans/module'

export interface ContextType<C extends Config> extends BasicContext<C>, AuthServiceAppend {
}

export type Context = ReturnType<typeof makeContext>

export interface AuthService extends GuardService {
  auth?: Auth
  token?: string
  /**
   * @throws {AuthenFailed}
   */
  authenticate: (token: AuthToken) => Promise<void>
  authenticated: () => boolean
  user: () => Auth
}

export interface AuthServiceAppend {
  auth: () => AuthService
}
