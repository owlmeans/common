import type { AuthServiceAppend } from '@owlmeans/client-auth'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'

export interface RenderOptions {
  domId?: string
  onReady?: boolean
  hydrate?: boolean
  debug?: boolean
}

export interface AppConfig extends ClientConfig {
}

export interface AppContext<C extends AppConfig = AppConfig> extends ClientContext<C>,
  AuthServiceAppend {
}
