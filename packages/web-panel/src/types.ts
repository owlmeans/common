
import type { WithFlowConfig } from '@owlmeans/flow'
import type { AppConfig as Config, AppContext as Context } from '@owlmeans/web-client'
import type { FlowService } from '@owlmeans/web-flow'
import type { SocketClientSettings, SocketStatusServiceAppend } from '@owlmeans/client-socket'

export interface AppConfig extends Config, WithFlowConfig {
  socket?: SocketClientSettings & {
    /**
     * Show `SocketReloadDialog` — a global, blocking "try again / reload the page" prompt — once every
     * socket in the app has given up reconnecting (`useSocketStatus() === 'lost'`). Off by
     * default: an app opts in once it has decided that outcome deserves a full-page prompt
     * rather than the caller's own fallback UI.
     */
    reloadDialog?: boolean
  }
}

export interface AppContext<C extends AppConfig = AppConfig> extends Context<C>, SocketStatusServiceAppend {
  flow: () => FlowService
}
