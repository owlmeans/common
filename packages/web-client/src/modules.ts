import { DISPATCHER } from '@owlmeans/auth'
import { modules as list } from '@owlmeans/auth-common'
import { modules as clientList } from '@owlmeans/client-auth'
import { elevate } from '@owlmeans/client-module'
import { handler } from '@owlmeans/client'
import { Dispatcher } from './components/dispatcher/component.js'

elevate(list, DISPATCHER, handler(Dispatcher), { force: true })

export const modules = [
  ...clientList,
  ...list.filter(module => module.getAlias() === DISPATCHER)
]
