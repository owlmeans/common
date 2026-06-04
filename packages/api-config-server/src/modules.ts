
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
import { elevate } from '@owlmeans/server-entrypoint'
import { modules as list, API_CONFIG } from '@owlmeans/api-config'
import { config } from './actions/index.js'

elevate(list, API_CONFIG, config.advertise)

export const modules: ServerEntrypoint<unknown>[] = [
  ...list.filter((module): module is ServerEntrypoint<unknown> => module.getAlias() === API_CONFIG)
]
