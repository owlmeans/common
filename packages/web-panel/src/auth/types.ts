import type { ClientConfig, ClientContext } from '@owlmeans/client-context'

export interface AppConfig extends ClientConfig {
}

export interface AppContext<C extends AppConfig> extends ClientContext<C> {
}
