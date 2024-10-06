
import type { ServerModule } from '@owlmeans/server-module'
import { elevate } from '@owlmeans/server-module'
import { modules as list, API_CONFIG } from '@owlmeans/api-config'
import { config } from './actions/index.js'

elevate(list, API_CONFIG, config.advertise)

export const modules: ServerModule<unknown>[] = [
  ...list.filter((module): module is ServerModule<unknown> => module.getAlias() === API_CONFIG)
]
