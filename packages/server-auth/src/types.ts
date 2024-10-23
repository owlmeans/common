import type { Auth, AuthToken } from '@owlmeans/auth'
import type { GuardService } from '@owlmeans/module'
import type { ResourceRecord } from '@owlmeans/resource'

export interface AuthService extends GuardService {
  authenticate: (token: AuthToken) => Promise<AuthToken>
  unpack: (token: string) => Promise<Auth>
}

export interface AuthServiceAppend {
  auth: () => AuthService
}

export interface AuthSpent extends ResourceRecord {
}
