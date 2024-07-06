
import { DISPATCHER } from '@owlmeans/auth'
import { modules as list } from '@owlmeans/auth-common'
import { elevate } from '@owlmeans/client-module'

const basicModules = [DISPATCHER]

export const basicAuthsModules = basicModules.map(alias => {
  elevate(list, alias)

  return list.find(module => module.route.route.alias === alias) as typeof list[0]
})
