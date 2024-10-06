
import { elevate } from '@owlmeans/server-module'
import { modules as list } from '@owlmeans/auth-common'
import { DISPATCHER_AUTHEN } from '@owlmeans/auth'
import type { ServerModule } from '@owlmeans/server-module'
import { authenticate } from './actions/service.js'

elevate(list, DISPATCHER_AUTHEN, authenticate)

export const modules: ServerModule<unknown>[] = [
  ...list.filter((module): module is ServerModule<unknown> => module.getAlias() === DISPATCHER_AUTHEN)
]
