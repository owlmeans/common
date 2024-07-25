import type { AuthServiceAppend } from '@owlmeans/client-auth'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '@owlmeans/client'
import type { CommonServiceRoute } from '@owlmeans/route'
import type { ClientModule } from '@owlmeans/client-module'
import type { AbstractRequest } from '@owlmeans/module'

export interface AppConfig extends ClientConfig {
  environments?: { [env: string]: Partial<CommonServiceRoute> }
  defaultEnv?: string
}

export interface AppContext<C extends AppConfig = AppConfig> extends ClientContext<C>,
  AuthServiceAppend {
}

export interface Navigator {
  navigate: <R extends AbstractRequest = AbstractRequest>(module: ClientModule<string, R>, request?: R) => Promise<void>
  go: <R extends AbstractRequest = AbstractRequest>(alias: string, request?: R) => Promise<void>
  press: <R extends AbstractRequest = AbstractRequest>(alias: string, request?: R) => () => void
}
