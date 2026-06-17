
import type { WithFlowConfig } from '@owlmeans/flow'
import type { AppConfig as Config, AppContext as Context } from '@owlmeans/web-client'
import type { FlowService } from '@owlmeans/web-flow'

export interface AppConfig extends Config, WithFlowConfig {
}

export interface AppContext<C extends AppConfig = AppConfig> extends Context<C> {
  flow: () => FlowService
}
