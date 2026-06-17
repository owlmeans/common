import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '@owlmeans/client'
import type { WithFlowConfig } from '@owlmeans/flow'
import type { FlowService } from '@owlmeans/web-flow'

export interface AppConfig extends ClientConfig, WithFlowConfig {
}

export interface AppContext<C extends AppConfig = AppConfig> extends ClientContext<C> {
  flow: () => FlowService
}
