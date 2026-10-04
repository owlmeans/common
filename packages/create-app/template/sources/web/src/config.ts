import { config } from '@owlmeans/web-panel'
import { APP_WEB, commonConfig } from '__APP_SLUG__-common'
import type { Config } from './types.js'
// The module augmentation that gives the config its `log` field — a side-effect import only.
import type {} from '@owlmeans/log'

const cfg: Config = config(APP_WEB, commonConfig as Config)

// The log level is decided at BUILD time (the logger is configured before the first render):
// `debug` under `vite`, `info` in a production build, unless `sources/web/.env` sets
// VITE_LOG_LEVEL; VITE_LOG_DEBUG lists scopes forced to debug (`*` for all).
const env = import.meta.env
cfg.log = { level: env.VITE_LOG_LEVEL || (env.PROD ? 'info' : 'debug'), debug: env.VITE_LOG_DEBUG ?? '' }

export default cfg
