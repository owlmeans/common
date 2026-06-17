import { config } from '@owlmeans/server-app'
import { APP_API, commonConfig } from '__APP_SLUG__-common'
import type { Config } from './types.js'

// The server listens on the APP_API service route's port (3000), declared in common/config.ts.
const cfg = config<Config>(APP_API, commonConfig as Config)

export default cfg
