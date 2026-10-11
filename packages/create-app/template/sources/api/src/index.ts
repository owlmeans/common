import { logger } from '@owlmeans/log'
import { main } from '@owlmeans/server-app'
import config from './config.js'
import { makeContext } from './context.js'
import { appBindings } from './entrypoints.js'
import type { Config, Context } from './types.js'

const log = logger('api')

const context = makeContext<Config, Context>(config)

main<{}, Config, Context>(context, appBindings).catch(error => {
  log.error('Start failed', error)
  process.exit(1)
})
