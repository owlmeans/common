import { config } from '@owlmeans/web-panel'
import { APP_WEB, commonConfig } from '__APP_SLUG__-common'
import type { Config } from './types.js'

const cfg: Config = config(APP_WEB, commonConfig as Config)

export default cfg
