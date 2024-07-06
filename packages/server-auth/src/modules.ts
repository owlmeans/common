
import { elevate } from '@owlmeans/server-module'
import { modules as list } from '@owlmeans/auth-common'
import { DISPATCHER_AUTHEN } from '@owlmeans/auth'
import type { Module } from '@owlmeans/server-module'
import { authenticate } from './actions/service.js'

elevate(list, DISPATCHER_AUTHEN, authenticate)

export const modules: Module<unknown>[] = [
  ...list.filter((module): module is Module<unknown> => module.getAlias() === DISPATCHER_AUTHEN)
]
