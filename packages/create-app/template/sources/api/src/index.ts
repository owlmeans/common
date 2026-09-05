import { main } from '@owlmeans/server-app'
import config from './config.js'
import { makeContext } from './context.js'
import { appEntrypoints } from './entrypoints.js'
import type { Config, Context } from './types.js'

const context = makeContext<Config, Context>(config)

main<{}, Config, Context>(context, appEntrypoints)
