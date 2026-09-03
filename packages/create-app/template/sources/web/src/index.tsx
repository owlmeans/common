import './index.css'
import { APP_API, APP_WEB } from '__APP_SLUG__-common'
import config from './config.js'
import { makeContext } from './context.js'
import { appEntrypoints } from './entrypoints.js'
import { render } from './render.js'
import type { Config, Context } from './types.js'

const context = makeContext<Config, Context>(config)
context.registerEntrypoints(appEntrypoints)

context.serviceRoute(APP_WEB, true)
context.serviceRoute(APP_API, true)

render<Config, Context>(context)
