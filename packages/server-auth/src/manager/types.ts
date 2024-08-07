import type { AllowanceRequest, AllowanceResponse, Auth, AuthCredentials, AuthToken, RelyChallenge } from '@owlmeans/auth'
import type { KlusterConfig } from '@owlmeans/kluster'
import type { GuardService } from '@owlmeans/module'
import type { ApiServerAppend } from '@owlmeans/server-api'
import type { ServerContext, ServerConfig } from '@owlmeans/server-context'
import type { ServiceRoute } from '@owlmeans/server-route'
import type { Connection } from '@owlmeans/socket'
import type { StaticResourceAppend } from '@owlmeans/static-resource'

export interface AppConfig extends ServerConfig, KlusterConfig {
  services: Record<string, ServiceRoute>
}

export interface AuthModel {
  init: (request: AllowanceRequest) => Promise<AllowanceResponse>

  authenticate: (credential: AuthCredentials) => Promise<AuthToken>

  rely: (conn: Connection, source?: Auth | null) => Promise<void>
}

export interface AppContext<C extends AppConfig = AppConfig> extends ServerContext<C>
  , ApiServerAppend
  , StaticResourceAppend { }

export interface RelyService extends GuardService {
}

export interface RelyAllowanceRequest extends AllowanceRequest {
  auth?: Auth
  provideRely?: RelyLinker
}

export interface RelyLinker {
  (rely: RelyChallenge, source: RelyChallenge): Promise<void>
}

export interface RelyToken {
  source: RelyChallenge,
  rely: RelyChallenge
}
