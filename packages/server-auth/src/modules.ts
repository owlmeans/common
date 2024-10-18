
import { elevate } from '@owlmeans/server-module'
import { modules as list } from '@owlmeans/auth-common'
import { DISPATCHER, DISPATCHER_AUTHEN } from '@owlmeans/auth'
import type { ServerModule } from '@owlmeans/server-module'
import { authenticate } from './actions/service.js'
import { stab, elevate as celevate } from '@owlmeans/client-module'

elevate(list, DISPATCHER_AUTHEN, authenticate)
celevate(list, DISPATCHER, stab)

export const modules: ServerModule<unknown>[] = [
  ...list.filter(
    (module): module is ServerModule<unknown> =>
      [DISPATCHER, DISPATCHER_AUTHEN].includes(module.getAlias())
  )
]
