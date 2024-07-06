import { DISPATCHER } from '@owlmeans/auth'
import { modules as list } from '@owlmeans/auth-common'
import { elevate } from '@owlmeans/client-module'
import { handler } from '@owlmeans/client'
import { Dispatcher } from './components/dispatcher/component.js'

elevate(list, DISPATCHER, handler(Dispatcher), { force: true })

export const modules = [
  ...list.filter(module => module.route.route.alias === DISPATCHER)
]
