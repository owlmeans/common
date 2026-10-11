import { config } from '@owlmeans/server-app'
import { APP_API, commonConfig } from '__APP_SLUG__-common'
import type { Config } from './types.js'
// The module augmentation that gives the config its `log` field — a side-effect import only.
import type {} from '@owlmeans/log'

// The server listens on the APP_API service route's port (3000), declared in common/config.ts.
const cfg = config<Config>(APP_API, commonConfig as Config)

// The log level comes from the runtime environment, never from code: `info` unless LOG_LEVEL
// says otherwise; LOG_DEBUG lists scopes forced to debug (`*` for all). Bun reads
// `sources/api/.env` on its own.
cfg.log = { level: process.env.LOG_LEVEL || 'info', debug: process.env.LOG_DEBUG ?? '' }

export default cfg
