
import { elevate } from '@owlmeans/client-module'
import { modules as list } from '@owlmeans/auth-common'
import { DISPATCHER_AUTHEN } from '@owlmeans/auth'
import type { Module } from '@owlmeans/client-module'

elevate(list, DISPATCHER_AUTHEN)

export const modules: Module<unknown>[] = [
  ...list.filter((module): module is Module<unknown> => module.getAlias() === DISPATCHER_AUTHEN)
]
