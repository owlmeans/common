import { ENV_DEFAULT, ENV_DEV } from '../consts.js'
import type { AppConfig, AppContext } from '../types.js'

export const extractPrimaryHost = <C extends AppConfig, T extends AppContext<C> = AppContext<C>>(context: T) => {
  const env = context.cfg.defaultEnv == null
    ? __DEV__ ? ENV_DEV : ENV_DEFAULT
    : context.cfg.defaultEnv
  let cfg = context.cfg.environments?.[env]
  if (cfg == null) {
    cfg = context.cfg.environments?.[ENV_DEFAULT]
  }
  if (cfg != null && cfg.host != null) {
    context.cfg.primaryHost = cfg.host
    context.cfg.primaryPort = cfg.port
  }
}
