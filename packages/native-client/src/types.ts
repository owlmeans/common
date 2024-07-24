import type { AuthServiceAppend } from '@owlmeans/client-auth'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import type { CommonServiceRoute } from '@owlmeans/route'

export interface AppConfig extends ClientConfig {
  environments?: { [env: string]: Partial<CommonServiceRoute> }
  defaultEnv?: string
}

export interface AppContext<C extends AppConfig = AppConfig> extends ClientContext<C>,
  AuthServiceAppend {
}
