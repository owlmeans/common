
import { elevate } from '@owlmeans/server-entrypoint'
import { entrypoints as list } from '@owlmeans/auth-common'
import { DISPATCHER, DISPATCHER_AUTHEN } from '@owlmeans/auth'
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
import { authenticate } from './actions/service.js'
import { stab, elevate as celevate } from '@owlmeans/client-entrypoint'

elevate(list, DISPATCHER_AUTHEN, authenticate)
celevate(list, DISPATCHER, stab)

export const entrypoints: ServerEntrypoint<unknown>[] = [
  ...list.filter(
    (module): module is ServerEntrypoint<unknown> =>
      [DISPATCHER, DISPATCHER_AUTHEN].includes(module.alias)
  )
]
