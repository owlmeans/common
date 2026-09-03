
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
import { elevate } from '@owlmeans/server-entrypoint'
import { entrypoints as list, API_CONFIG } from '@owlmeans/api-config'
import { config } from './actions/index.js'

elevate(list, API_CONFIG, config.advertise)

export const entrypoints: ServerEntrypoint<unknown>[] = [
  ...list.filter((module): module is ServerEntrypoint<unknown> => module.alias === API_CONFIG)
]
