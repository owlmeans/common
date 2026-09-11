import type { AppConfig, AppContext } from './types.js'

export const extractPrimaryHost = <C extends AppConfig = AppConfig, T extends AppContext<C> = AppContext<C>>(context: T) => {
  if (typeof window !== 'undefined') {
    context.cfg.primaryHost = window.location.hostname
    context.cfg.primaryPort = window.location.port != null && window.location.port != '' ? parseInt(window.location.port) : undefined
  }
}
