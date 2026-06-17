import { AppType, service } from '@owlmeans/config'
import { API_PORT, APP, APP_API, APP_WEB, WEB_PORT } from './consts.js'

// The web (frontend) service this config belongs to by default.
const cfg = service({
  type: AppType.Frontend,
  service: APP_WEB,
  host: 'localhost',
  port: WEB_PORT,
})

// The api (backend) service the web calls. `base: 'api'` prefixes every API route with `/api`.
service({
  type: AppType.Backend,
  service: APP_API,
  host: 'localhost',
  port: API_PORT,
  base: 'api',
}, cfg)

cfg.debug = { all: true }
cfg.alias = APP

export const commonConfig = cfg
